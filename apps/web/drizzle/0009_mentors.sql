CREATE TABLE "enrollment_mentors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"assigned_by" uuid,
	"reason" text,
	CONSTRAINT "enrollment_mentors_role_check" CHECK ("enrollment_mentors"."role" IN ('primary', 'secondary'))
);
--> statement-breakpoint
CREATE TABLE "mentor_profiles" (
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"specialties" text[] DEFAULT '{}'::text[] NOT NULL,
	"bio" text,
	"capacity" integer,
	"accepting_students" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "mentor_profiles_organization_id_user_id_pk" PRIMARY KEY("organization_id","user_id"),
	CONSTRAINT "mentor_profiles_capacity_check" CHECK ("mentor_profiles"."capacity" IS NULL OR "mentor_profiles"."capacity" >= 0)
);
--> statement-breakpoint
ALTER TABLE "notes" DROP CONSTRAINT "notes_visibility_check";--> statement-breakpoint
ALTER TABLE "enrollment_mentors" ADD CONSTRAINT "enrollment_mentors_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment_mentors" ADD CONSTRAINT "enrollment_mentors_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment_mentors" ADD CONSTRAINT "enrollment_mentors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment_mentors" ADD CONSTRAINT "enrollment_mentors_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_profiles" ADD CONSTRAINT "mentor_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_profiles" ADD CONSTRAINT "mentor_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_profiles" ADD CONSTRAINT "mentor_profiles_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "enrollment_mentors_one_active_primary" ON "enrollment_mentors" USING btree ("enrollment_id") WHERE "enrollment_mentors"."role" = 'primary' AND "enrollment_mentors"."ended_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "enrollment_mentors_active_key" ON "enrollment_mentors" USING btree ("enrollment_id","user_id") WHERE "enrollment_mentors"."ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX "enrollment_mentors_user_active_idx" ON "enrollment_mentors" USING btree ("user_id") WHERE "enrollment_mentors"."ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX "enrollment_mentors_enrollment_idx" ON "enrollment_mentors" USING btree ("enrollment_id","started_at");--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_visibility_check" CHECK ("notes"."visibility" IN ('internal', 'shared', 'private'));--> statement-breakpoint
CREATE TRIGGER "enrollment_mentors_set_organization_id" BEFORE INSERT OR UPDATE OF "enrollment_id", "organization_id" ON "enrollment_mentors" FOR EACH ROW EXECUTE FUNCTION "set_organization_id"('enrollments', 'id', 'enrollment_id');--> statement-breakpoint
-- Legacy mentor bridge (sprint 4, expand step). `students.primary_mentor_id` stays the source
-- of truth for the legacy run: a new legacy enrollment gets the student's primary mentor, and
-- a change of primary mentor ends the old row and opens a new one (a secondary row of the new
-- mentor ends, since they are now primary). `assigned_by` and `reason` come from the active
-- `mentor_assignments` row that `changeMentor` writes just before it updates `students`.
CREATE FUNCTION "programs_legacy_enrollment_mentor"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "enrollment_mentors" ("id", "enrollment_id", "user_id", "role", "started_at", "assigned_by", "reason")
  SELECT gen_random_uuid(), NEW."id", st."primary_mentor_id", 'primary', coalesce(ma."started_at", now()), ma."assigned_by", ma."reason"
  FROM "program_runs" r
  JOIN "students" st ON st."user_id" = NEW."student_id"
  LEFT JOIN "mentor_assignments" ma ON ma."student_id" = st."user_id" AND ma."role" = 'primary'
    AND ma."ended_at" IS NULL AND ma."mentor_id" = st."primary_mentor_id"
  WHERE r."id" = NEW."run_id" AND r."legacy_path_id" IS NOT NULL AND st."primary_mentor_id" IS NOT NULL;
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "enrollments_sync_legacy_mentor" AFTER INSERT ON "enrollments" FOR EACH ROW EXECUTE FUNCTION "programs_legacy_enrollment_mentor"();--> statement-breakpoint
CREATE FUNCTION "programs_sync_legacy_mentor"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_enrollment uuid;
BEGIN
  IF OLD."primary_mentor_id" IS NOT DISTINCT FROM NEW."primary_mentor_id" THEN
    RETURN NULL;
  END IF;
  SELECT e."id" INTO v_enrollment
  FROM "enrollments" e JOIN "program_runs" r ON r."id" = e."run_id"
  WHERE e."student_id" = NEW."user_id" AND r."legacy_path_id" IS NOT NULL;
  IF v_enrollment IS NULL THEN
    RETURN NULL;
  END IF;
  UPDATE "enrollment_mentors" SET "ended_at" = now()
  WHERE "enrollment_id" = v_enrollment AND "ended_at" IS NULL
    AND ("role" = 'primary' OR "user_id" = NEW."primary_mentor_id");
  IF NEW."primary_mentor_id" IS NOT NULL THEN
    INSERT INTO "enrollment_mentors" ("id", "enrollment_id", "user_id", "role", "started_at", "assigned_by", "reason")
    SELECT gen_random_uuid(), v_enrollment, NEW."primary_mentor_id", 'primary', now(), ma."assigned_by", ma."reason"
    FROM (SELECT 1) one
    LEFT JOIN "mentor_assignments" ma ON ma."student_id" = NEW."user_id" AND ma."role" = 'primary'
      AND ma."ended_at" IS NULL AND ma."mentor_id" = NEW."primary_mentor_id";
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "students_sync_legacy_mentor" AFTER UPDATE OF "primary_mentor_id" ON "students" FOR EACH ROW EXECUTE FUNCTION "programs_sync_legacy_mentor"();--> statement-breakpoint
-- Backfill: the 0.1 assignment history moves onto each student's legacy enrollment. Ended rows
-- keep their dates; `backup` becomes `secondary`. The active primary row comes from
-- `students.primary_mentor_id` (what access used until now), dated from its open assignment.
INSERT INTO "enrollment_mentors" ("id", "enrollment_id", "user_id", "role", "started_at", "ended_at", "assigned_by", "reason")
SELECT gen_random_uuid(), e."id", ma."mentor_id", CASE ma."role" WHEN 'primary' THEN 'primary' ELSE 'secondary' END,
  ma."started_at", ma."ended_at", ma."assigned_by", ma."reason"
FROM "mentor_assignments" ma
JOIN "enrollments" e ON e."student_id" = ma."student_id"
JOIN "program_runs" r ON r."id" = e."run_id" AND r."legacy_path_id" IS NOT NULL
WHERE ma."ended_at" IS NOT NULL
   OR (ma."role" <> 'primary' AND NOT EXISTS (
     SELECT 1 FROM "students" st WHERE st."user_id" = ma."student_id" AND st."primary_mentor_id" = ma."mentor_id"));--> statement-breakpoint
INSERT INTO "enrollment_mentors" ("id", "enrollment_id", "user_id", "role", "started_at", "assigned_by", "reason")
SELECT gen_random_uuid(), e."id", st."primary_mentor_id", 'primary', coalesce(ma."started_at", st."joined_at"), ma."assigned_by", ma."reason"
FROM "students" st
JOIN "enrollments" e ON e."student_id" = st."user_id"
JOIN "program_runs" r ON r."id" = e."run_id" AND r."legacy_path_id" IS NOT NULL
LEFT JOIN "mentor_assignments" ma ON ma."student_id" = st."user_id" AND ma."role" = 'primary'
  AND ma."ended_at" IS NULL AND ma."mentor_id" = st."primary_mentor_id"
WHERE st."primary_mentor_id" IS NOT NULL;
