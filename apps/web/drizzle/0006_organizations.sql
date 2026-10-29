CREATE TABLE "organization_memberships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"invited_by" uuid,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_memberships_role_check" CHECK ("organization_memberships"."role" IN ('owner', 'admin', 'mentor', 'mentee')),
	CONSTRAINT "organization_memberships_status_check" CHECK ("organization_memberships"."status" IN ('active', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"default_locale" text DEFAULT 'fa' NOT NULL,
	"timezone" text DEFAULT 'Asia/Tehran' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_format" CHECK ("organizations"."slug" ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
	CONSTRAINT "organizations_status_check" CHECK ("organizations"."status" IN ('active', 'suspended'))
);
--> statement-breakpoint
DROP INDEX "platforms_name_key";--> statement-breakpoint
DROP INDEX "tracks_code_key";--> statement-breakpoint
DROP INDEX "learning_paths_one_default";--> statement-breakpoint
DROP INDEX "milestone_types_order_idx";--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "canned_responses" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "learning_paths" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "milestone_types" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "platforms" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "stages" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "task_templates" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "tracks" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "checkins" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "student_flags" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "student_health" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_platform_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "milestones" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "stage_transitions" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "question_messages" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "question_threads" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "mentor_assignments" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "platform_profiles" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "profile_snapshots" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "task_extensions" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "timeline_events" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_memberships_org_user_key" ON "organization_memberships" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "organization_memberships_user_idx" ON "organization_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "organization_memberships_org_role_idx" ON "organization_memberships" USING btree ("organization_id","role","status");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations" USING btree ("slug");--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canned_responses" ADD CONSTRAINT "canned_responses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_paths" ADD CONSTRAINT "learning_paths_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_types" ADD CONSTRAINT "milestone_types_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platforms" ADD CONSTRAINT "platforms_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stages" ADD CONSTRAINT "stages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_flags" ADD CONSTRAINT "student_flags_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_health" ADD CONSTRAINT "student_health_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_transitions" ADD CONSTRAINT "stage_transitions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_messages" ADD CONSTRAINT "question_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_threads" ADD CONSTRAINT "question_threads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_assignments" ADD CONSTRAINT "mentor_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_profiles" ADD CONSTRAINT "platform_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_snapshots" ADD CONSTRAINT "profile_snapshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_extensions" ADD CONSTRAINT "task_extensions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "platforms_org_name_key" ON "platforms" USING btree ("organization_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "tracks_org_code_key" ON "tracks" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX "students_org_lifecycle_idx" ON "students" USING btree ("organization_id","lifecycle_status");--> statement-breakpoint
CREATE UNIQUE INDEX "learning_paths_one_default" ON "learning_paths" USING btree ("organization_id") WHERE "learning_paths"."is_default";--> statement-breakpoint
CREATE INDEX "milestone_types_order_idx" ON "milestone_types" USING btree ("organization_id","sort_order");--> statement-breakpoint
-- ADR-0011: file every 0.1 row under one default organization (renamed later with `pnpm org:rename`).--> statement-breakpoint
INSERT INTO "organizations" ("id", "slug", "name") VALUES ('01920000-0000-7000-8000-00000000f001', 'default', 'سازمان پیش‌فرض');--> statement-breakpoint
UPDATE "canned_responses" SET "organization_id" = '01920000-0000-7000-8000-00000000f001';--> statement-breakpoint
UPDATE "learning_paths" SET "organization_id" = '01920000-0000-7000-8000-00000000f001';--> statement-breakpoint
UPDATE "milestone_types" SET "organization_id" = '01920000-0000-7000-8000-00000000f001';--> statement-breakpoint
UPDATE "platforms" SET "organization_id" = '01920000-0000-7000-8000-00000000f001';--> statement-breakpoint
UPDATE "settings" SET "organization_id" = '01920000-0000-7000-8000-00000000f001';--> statement-breakpoint
UPDATE "stages" SET "organization_id" = '01920000-0000-7000-8000-00000000f001';--> statement-breakpoint
UPDATE "task_templates" SET "organization_id" = '01920000-0000-7000-8000-00000000f001';--> statement-breakpoint
UPDATE "tracks" SET "organization_id" = '01920000-0000-7000-8000-00000000f001';--> statement-breakpoint
UPDATE "checkins" SET "organization_id" = '01920000-0000-7000-8000-00000000f001';--> statement-breakpoint
UPDATE "attachments" SET "organization_id" = '01920000-0000-7000-8000-00000000f001';--> statement-breakpoint
UPDATE "student_flags" SET "organization_id" = '01920000-0000-7000-8000-00000000f001';--> statement-breakpoint
UPDATE "student_health" SET "organization_id" = '01920000-0000-7000-8000-00000000f001';--> statement-breakpoint
UPDATE "sessions" SET "organization_id" = '01920000-0000-7000-8000-00000000f001';--> statement-breakpoint
UPDATE "milestones" SET "organization_id" = '01920000-0000-7000-8000-00000000f001';--> statement-breakpoint
UPDATE "stage_transitions" SET "organization_id" = '01920000-0000-7000-8000-00000000f001';--> statement-breakpoint
UPDATE "question_messages" SET "organization_id" = '01920000-0000-7000-8000-00000000f001';--> statement-breakpoint
UPDATE "question_threads" SET "organization_id" = '01920000-0000-7000-8000-00000000f001';--> statement-breakpoint
UPDATE "reminders" SET "organization_id" = '01920000-0000-7000-8000-00000000f001';--> statement-breakpoint
UPDATE "mentor_assignments" SET "organization_id" = '01920000-0000-7000-8000-00000000f001';--> statement-breakpoint
UPDATE "platform_profiles" SET "organization_id" = '01920000-0000-7000-8000-00000000f001';--> statement-breakpoint
UPDATE "profile_snapshots" SET "organization_id" = '01920000-0000-7000-8000-00000000f001';--> statement-breakpoint
UPDATE "students" SET "organization_id" = '01920000-0000-7000-8000-00000000f001';--> statement-breakpoint
UPDATE "reviews" SET "organization_id" = '01920000-0000-7000-8000-00000000f001';--> statement-breakpoint
UPDATE "submissions" SET "organization_id" = '01920000-0000-7000-8000-00000000f001';--> statement-breakpoint
UPDATE "task_extensions" SET "organization_id" = '01920000-0000-7000-8000-00000000f001';--> statement-breakpoint
UPDATE "tasks" SET "organization_id" = '01920000-0000-7000-8000-00000000f001';--> statement-breakpoint
UPDATE "notes" SET "organization_id" = '01920000-0000-7000-8000-00000000f001';--> statement-breakpoint
UPDATE "timeline_events" SET "organization_id" = '01920000-0000-7000-8000-00000000f001';--> statement-breakpoint
UPDATE "audit_log" SET "organization_id" = '01920000-0000-7000-8000-00000000f001';--> statement-breakpoint
-- One membership per existing user. The earliest admin becomes the owner; an account the
-- admin had disabled keeps a disabled membership, and `users.status` becomes the account state.
INSERT INTO "organization_memberships" ("id", "organization_id", "user_id", "role", "status", "disabled_at", "created_at", "updated_at")
SELECT gen_random_uuid(), '01920000-0000-7000-8000-00000000f001', u."id",
  CASE
    WHEN u."role" = 'admin' AND u."id" = (
      SELECT a."id" FROM "users" a WHERE a."role" = 'admin' AND a."erased_at" IS NULL ORDER BY a."created_at", a."id" LIMIT 1
    ) THEN 'owner'
    WHEN u."role" = 'admin' THEN 'admin'
    WHEN u."role" = 'mentor' THEN 'mentor'
    ELSE 'mentee'
  END,
  CASE WHEN u."status" = 'disabled' THEN 'disabled' ELSE 'active' END,
  CASE WHEN u."status" = 'disabled' THEN u."updated_at" END,
  u."created_at", now()
FROM "users" u;--> statement-breakpoint
UPDATE "users" SET "status" = CASE WHEN "password_hash" IS NULL THEN 'invited' ELSE 'active' END
WHERE "status" = 'disabled' AND "erased_at" IS NULL;--> statement-breakpoint
ALTER TABLE "canned_responses" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_paths" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "milestone_types" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "platforms" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "stages" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "task_templates" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tracks" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "checkins" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "student_flags" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "student_health" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "milestones" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "stage_transitions" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "question_messages" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "question_threads" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "reminders" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "mentor_assignments" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_profiles" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "profile_snapshots" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "task_extensions" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "notes" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "timeline_events" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" DROP CONSTRAINT "settings_pkey";--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_pkey" PRIMARY KEY("organization_id","key");--> statement-breakpoint
-- ADR-0011 section 3: a child row always takes its parent's organization. Arguments:
-- parent table, parent key column, the child's foreign-key column. A row whose foreign key is
-- null (a reminder about nobody) keeps the organization the service set.
CREATE FUNCTION "set_organization_id"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parent_id uuid := (to_jsonb(NEW) ->> TG_ARGV[2])::uuid;
  parent_org uuid;
BEGIN
  IF parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  EXECUTE format('SELECT organization_id FROM %I WHERE %I = $1', TG_ARGV[0], TG_ARGV[1])
    INTO parent_org USING parent_id;
  IF parent_org IS NULL THEN
    RAISE EXCEPTION 'set_organization_id: no % row %', TG_ARGV[0], parent_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  NEW.organization_id := parent_org;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "stages_set_organization_id" BEFORE INSERT OR UPDATE OF "path_id", "organization_id" ON "stages" FOR EACH ROW EXECUTE FUNCTION "set_organization_id"('learning_paths', 'id', 'path_id');--> statement-breakpoint
CREATE TRIGGER "mentor_assignments_set_organization_id" BEFORE INSERT OR UPDATE OF "student_id", "organization_id" ON "mentor_assignments" FOR EACH ROW EXECUTE FUNCTION "set_organization_id"('students', 'user_id', 'student_id');--> statement-breakpoint
CREATE TRIGGER "platform_profiles_set_organization_id" BEFORE INSERT OR UPDATE OF "student_id", "organization_id" ON "platform_profiles" FOR EACH ROW EXECUTE FUNCTION "set_organization_id"('students', 'user_id', 'student_id');--> statement-breakpoint
CREATE TRIGGER "stage_transitions_set_organization_id" BEFORE INSERT OR UPDATE OF "student_id", "organization_id" ON "stage_transitions" FOR EACH ROW EXECUTE FUNCTION "set_organization_id"('students', 'user_id', 'student_id');--> statement-breakpoint
CREATE TRIGGER "tasks_set_organization_id" BEFORE INSERT OR UPDATE OF "student_id", "organization_id" ON "tasks" FOR EACH ROW EXECUTE FUNCTION "set_organization_id"('students', 'user_id', 'student_id');--> statement-breakpoint
CREATE TRIGGER "notes_set_organization_id" BEFORE INSERT OR UPDATE OF "student_id", "organization_id" ON "notes" FOR EACH ROW EXECUTE FUNCTION "set_organization_id"('students', 'user_id', 'student_id');--> statement-breakpoint
CREATE TRIGGER "timeline_events_set_organization_id" BEFORE INSERT OR UPDATE OF "student_id", "organization_id" ON "timeline_events" FOR EACH ROW EXECUTE FUNCTION "set_organization_id"('students', 'user_id', 'student_id');--> statement-breakpoint
CREATE TRIGGER "checkins_set_organization_id" BEFORE INSERT OR UPDATE OF "student_id", "organization_id" ON "checkins" FOR EACH ROW EXECUTE FUNCTION "set_organization_id"('students', 'user_id', 'student_id');--> statement-breakpoint
CREATE TRIGGER "milestones_set_organization_id" BEFORE INSERT OR UPDATE OF "student_id", "organization_id" ON "milestones" FOR EACH ROW EXECUTE FUNCTION "set_organization_id"('students', 'user_id', 'student_id');--> statement-breakpoint
CREATE TRIGGER "student_flags_set_organization_id" BEFORE INSERT OR UPDATE OF "student_id", "organization_id" ON "student_flags" FOR EACH ROW EXECUTE FUNCTION "set_organization_id"('students', 'user_id', 'student_id');--> statement-breakpoint
CREATE TRIGGER "student_health_set_organization_id" BEFORE INSERT OR UPDATE OF "student_id", "organization_id" ON "student_health" FOR EACH ROW EXECUTE FUNCTION "set_organization_id"('students', 'user_id', 'student_id');--> statement-breakpoint
CREATE TRIGGER "question_threads_set_organization_id" BEFORE INSERT OR UPDATE OF "student_id", "organization_id" ON "question_threads" FOR EACH ROW EXECUTE FUNCTION "set_organization_id"('students', 'user_id', 'student_id');--> statement-breakpoint
CREATE TRIGGER "reminders_set_organization_id" BEFORE INSERT OR UPDATE OF "student_id", "organization_id" ON "reminders" FOR EACH ROW EXECUTE FUNCTION "set_organization_id"('students', 'user_id', 'student_id');--> statement-breakpoint
CREATE TRIGGER "profile_snapshots_set_organization_id" BEFORE INSERT OR UPDATE OF "profile_id", "organization_id" ON "profile_snapshots" FOR EACH ROW EXECUTE FUNCTION "set_organization_id"('platform_profiles', 'id', 'profile_id');--> statement-breakpoint
CREATE TRIGGER "task_extensions_set_organization_id" BEFORE INSERT OR UPDATE OF "task_id", "organization_id" ON "task_extensions" FOR EACH ROW EXECUTE FUNCTION "set_organization_id"('tasks', 'id', 'task_id');--> statement-breakpoint
CREATE TRIGGER "submissions_set_organization_id" BEFORE INSERT OR UPDATE OF "task_id", "organization_id" ON "submissions" FOR EACH ROW EXECUTE FUNCTION "set_organization_id"('tasks', 'id', 'task_id');--> statement-breakpoint
CREATE TRIGGER "reviews_set_organization_id" BEFORE INSERT OR UPDATE OF "submission_id", "organization_id" ON "reviews" FOR EACH ROW EXECUTE FUNCTION "set_organization_id"('submissions', 'id', 'submission_id');--> statement-breakpoint
CREATE TRIGGER "question_messages_set_organization_id" BEFORE INSERT OR UPDATE OF "thread_id", "organization_id" ON "question_messages" FOR EACH ROW EXECUTE FUNCTION "set_organization_id"('question_threads', 'id', 'thread_id');
