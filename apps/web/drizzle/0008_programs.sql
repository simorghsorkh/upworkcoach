CREATE TABLE "curriculum_nodes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"node_type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"content_links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"is_gate" boolean DEFAULT false NOT NULL,
	"expected_days" integer,
	"is_open_ended" boolean DEFAULT false NOT NULL,
	"due_offset_days" integer,
	"submission_type" text,
	"checklist_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"legacy_stage_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"template_id" uuid NOT NULL,
	"parent_id" uuid,
	CONSTRAINT "curriculum_nodes_node_type_check" CHECK ("curriculum_nodes"."node_type" IN ('phase', 'lesson', 'assignment', 'checklist', 'resource', 'milestone')),
	CONSTRAINT "curriculum_nodes_parent_check" CHECK (("curriculum_nodes"."node_type" = 'phase') = ("curriculum_nodes"."parent_id" IS NULL)),
	CONSTRAINT "curriculum_nodes_numbers_check" CHECK (("curriculum_nodes"."expected_days" IS NULL OR "curriculum_nodes"."expected_days" BETWEEN 1 AND 3650)
      AND ("curriculum_nodes"."due_offset_days" IS NULL OR "curriculum_nodes"."due_offset_days" BETWEEN 0 AND 3650))
);
--> statement-breakpoint
CREATE TABLE "enrollment_transitions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"from_node_id" uuid,
	"to_node_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"note" text,
	"actor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enrollment_transitions_kind_check" CHECK ("enrollment_transitions"."kind" IN ('initial', 'advance', 'skip_by_assessment', 'advance_with_exception', 'regress')),
	CONSTRAINT "enrollment_transitions_from_check" CHECK (("enrollment_transitions"."kind" = 'initial') = ("enrollment_transitions"."from_node_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"paused_until" date,
	"current_phase_node_id" uuid,
	"phase_entered_at" timestamp with time zone,
	"session_quota" integer,
	"valid_until" date,
	"enrolled_by" uuid,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enrollments_status_check" CHECK ("enrollments"."status" IN ('active', 'paused', 'completed', 'dropped'))
);
--> statement-breakpoint
CREATE TABLE "program_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"template_id" uuid,
	"kind" text NOT NULL,
	"mode" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"source_locale" text DEFAULT 'fa' NOT NULL,
	"template_revision" integer,
	"legacy_path_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "program_runs_kind_check" CHECK ("program_runs"."kind" IN ('program', 'one_on_one')),
	CONSTRAINT "program_runs_mode_check" CHECK ("program_runs"."mode" IN ('group', 'individual')),
	CONSTRAINT "program_runs_status_check" CHECK ("program_runs"."status" IN ('draft', 'active', 'completed', 'archived')),
	CONSTRAINT "program_runs_dates_check" CHECK ("program_runs"."ends_on" IS NULL OR "program_runs"."starts_on" IS NULL OR "program_runs"."ends_on" >= "program_runs"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "program_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"source_locale" text DEFAULT 'fa' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"owner_id" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"rejection_reason" text,
	"session_quota" integer,
	"session_minutes" integer,
	"validity_days" integer,
	"duration_weeks" integer,
	"extensions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"legacy_path_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "program_templates_kind_check" CHECK ("program_templates"."kind" IN ('program', 'one_on_one')),
	CONSTRAINT "program_templates_status_check" CHECK ("program_templates"."status" IN ('draft', 'published', 'archived')),
	CONSTRAINT "program_templates_visibility_check" CHECK ("program_templates"."visibility" IN ('private', 'pending_approval', 'organization')),
	CONSTRAINT "program_templates_numbers_check" CHECK (("program_templates"."session_quota" IS NULL OR "program_templates"."session_quota" BETWEEN 1 AND 1000)
        AND ("program_templates"."session_minutes" IS NULL OR "program_templates"."session_minutes" BETWEEN 5 AND 600)
        AND ("program_templates"."validity_days" IS NULL OR "program_templates"."validity_days" BETWEEN 1 AND 3650)
        AND ("program_templates"."duration_weeks" IS NULL OR "program_templates"."duration_weeks" BETWEEN 1 AND 520))
);
--> statement-breakpoint
CREATE TABLE "run_nodes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"node_type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"content_links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"is_gate" boolean DEFAULT false NOT NULL,
	"expected_days" integer,
	"is_open_ended" boolean DEFAULT false NOT NULL,
	"due_offset_days" integer,
	"submission_type" text,
	"checklist_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"legacy_stage_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"run_id" uuid NOT NULL,
	"parent_id" uuid,
	"source_node_id" uuid,
	CONSTRAINT "run_nodes_node_type_check" CHECK ("run_nodes"."node_type" IN ('phase', 'lesson', 'assignment', 'checklist', 'resource', 'milestone')),
	CONSTRAINT "run_nodes_parent_check" CHECK (("run_nodes"."node_type" = 'phase') = ("run_nodes"."parent_id" IS NULL)),
	CONSTRAINT "run_nodes_numbers_check" CHECK (("run_nodes"."expected_days" IS NULL OR "run_nodes"."expected_days" BETWEEN 1 AND 3650)
      AND ("run_nodes"."due_offset_days" IS NULL OR "run_nodes"."due_offset_days" BETWEEN 0 AND 3650))
);
--> statement-breakpoint
CREATE TABLE "run_staff" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"assigned_by" uuid,
	CONSTRAINT "run_staff_role_check" CHECK ("run_staff"."role" IN ('manager', 'mentor'))
);
--> statement-breakpoint
ALTER TABLE "curriculum_nodes" ADD CONSTRAINT "curriculum_nodes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_nodes" ADD CONSTRAINT "curriculum_nodes_legacy_stage_id_stages_id_fk" FOREIGN KEY ("legacy_stage_id") REFERENCES "public"."stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_nodes" ADD CONSTRAINT "curriculum_nodes_template_id_program_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."program_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_nodes" ADD CONSTRAINT "curriculum_nodes_parent_id_curriculum_nodes_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."curriculum_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment_transitions" ADD CONSTRAINT "enrollment_transitions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment_transitions" ADD CONSTRAINT "enrollment_transitions_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment_transitions" ADD CONSTRAINT "enrollment_transitions_from_node_id_run_nodes_id_fk" FOREIGN KEY ("from_node_id") REFERENCES "public"."run_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment_transitions" ADD CONSTRAINT "enrollment_transitions_to_node_id_run_nodes_id_fk" FOREIGN KEY ("to_node_id") REFERENCES "public"."run_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment_transitions" ADD CONSTRAINT "enrollment_transitions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_run_id_program_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."program_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_students_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_current_phase_node_id_run_nodes_id_fk" FOREIGN KEY ("current_phase_node_id") REFERENCES "public"."run_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_enrolled_by_users_id_fk" FOREIGN KEY ("enrolled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_runs" ADD CONSTRAINT "program_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_runs" ADD CONSTRAINT "program_runs_template_id_program_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."program_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_runs" ADD CONSTRAINT "program_runs_legacy_path_id_learning_paths_id_fk" FOREIGN KEY ("legacy_path_id") REFERENCES "public"."learning_paths"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_runs" ADD CONSTRAINT "program_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_templates" ADD CONSTRAINT "program_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_templates" ADD CONSTRAINT "program_templates_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_templates" ADD CONSTRAINT "program_templates_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_templates" ADD CONSTRAINT "program_templates_legacy_path_id_learning_paths_id_fk" FOREIGN KEY ("legacy_path_id") REFERENCES "public"."learning_paths"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_nodes" ADD CONSTRAINT "run_nodes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_nodes" ADD CONSTRAINT "run_nodes_legacy_stage_id_stages_id_fk" FOREIGN KEY ("legacy_stage_id") REFERENCES "public"."stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_nodes" ADD CONSTRAINT "run_nodes_run_id_program_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."program_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_nodes" ADD CONSTRAINT "run_nodes_parent_id_run_nodes_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."run_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_nodes" ADD CONSTRAINT "run_nodes_source_node_id_curriculum_nodes_id_fk" FOREIGN KEY ("source_node_id") REFERENCES "public"."curriculum_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_staff" ADD CONSTRAINT "run_staff_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_staff" ADD CONSTRAINT "run_staff_run_id_program_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."program_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_staff" ADD CONSTRAINT "run_staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_staff" ADD CONSTRAINT "run_staff_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "curriculum_nodes_template_idx" ON "curriculum_nodes" USING btree ("template_id","parent_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "curriculum_nodes_legacy_stage_key" ON "curriculum_nodes" USING btree ("template_id","legacy_stage_id") WHERE "curriculum_nodes"."legacy_stage_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "enrollment_transitions_enrollment_idx" ON "enrollment_transitions" USING btree ("enrollment_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "enrollments_run_student_key" ON "enrollments" USING btree ("run_id","student_id");--> statement-breakpoint
CREATE INDEX "enrollments_student_idx" ON "enrollments" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "program_runs_org_status_idx" ON "program_runs" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "program_runs_template_idx" ON "program_runs" USING btree ("template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "program_runs_legacy_path_key" ON "program_runs" USING btree ("legacy_path_id") WHERE "program_runs"."legacy_path_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "program_templates_org_status_idx" ON "program_templates" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "program_templates_legacy_path_key" ON "program_templates" USING btree ("legacy_path_id") WHERE "program_templates"."legacy_path_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "run_nodes_run_idx" ON "run_nodes" USING btree ("run_id","parent_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "run_nodes_legacy_stage_key" ON "run_nodes" USING btree ("run_id","legacy_stage_id") WHERE "run_nodes"."legacy_stage_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "run_staff_active_key" ON "run_staff" USING btree ("run_id","user_id") WHERE "run_staff"."ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX "run_staff_user_active_idx" ON "run_staff" USING btree ("user_id") WHERE "run_staff"."ended_at" IS NULL;--> statement-breakpoint
-- ADR-0011 section 3: child rows take their parent's organization.
CREATE TRIGGER "curriculum_nodes_set_organization_id" BEFORE INSERT OR UPDATE OF "template_id", "organization_id" ON "curriculum_nodes" FOR EACH ROW EXECUTE FUNCTION "set_organization_id"('program_templates', 'id', 'template_id');--> statement-breakpoint
CREATE TRIGGER "run_nodes_set_organization_id" BEFORE INSERT OR UPDATE OF "run_id", "organization_id" ON "run_nodes" FOR EACH ROW EXECUTE FUNCTION "set_organization_id"('program_runs', 'id', 'run_id');--> statement-breakpoint
CREATE TRIGGER "run_staff_set_organization_id" BEFORE INSERT OR UPDATE OF "run_id", "organization_id" ON "run_staff" FOR EACH ROW EXECUTE FUNCTION "set_organization_id"('program_runs', 'id', 'run_id');--> statement-breakpoint
CREATE TRIGGER "enrollments_set_organization_id" BEFORE INSERT OR UPDATE OF "run_id", "organization_id" ON "enrollments" FOR EACH ROW EXECUTE FUNCTION "set_organization_id"('program_runs', 'id', 'run_id');--> statement-breakpoint
CREATE TRIGGER "enrollment_transitions_set_organization_id" BEFORE INSERT OR UPDATE OF "enrollment_id", "organization_id" ON "enrollment_transitions" FOR EACH ROW EXECUTE FUNCTION "set_organization_id"('enrollments', 'id', 'enrollment_id');--> statement-breakpoint
-- An enrollment's student must belong to the run's organization. Named so it fires after
-- "enrollments_set_organization_id" (BEFORE triggers run in name order).
CREATE FUNCTION "check_enrollment_student_org"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "students" WHERE "user_id" = NEW."student_id" AND "organization_id" = NEW."organization_id"
  ) THEN
    RAISE EXCEPTION 'enrollment student % is not in organization %', NEW."student_id", NEW."organization_id"
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "enrollments_zz_student_org" BEFORE INSERT OR UPDATE OF "student_id", "run_id", "organization_id" ON "enrollments" FOR EACH ROW EXECUTE FUNCTION "check_enrollment_student_org"();--> statement-breakpoint
-- Legacy program (ADR-0012 section 9, expand step). The 0.1 path stays the source of truth
-- for its students until the contract migration: every stage is mirrored into a phase of the
-- legacy template and run, and every student's stage and status into an enrollment of the
-- legacy run. Both triggers go away with the contract migration.
CREATE FUNCTION "programs_sync_legacy_stage"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "curriculum_nodes" ("id", "template_id", "node_type", "title", "body", "content_links", "sort_order", "expected_days", "is_open_ended", "legacy_stage_id")
  SELECT gen_random_uuid(), t."id", 'phase', NEW."name", NEW."student_description", NEW."content_links", NEW."sort_order", NEW."expected_days", NEW."is_open_ended", NEW."id"
  FROM "program_templates" t WHERE t."legacy_path_id" = NEW."path_id"
  ON CONFLICT ("template_id", "legacy_stage_id") WHERE "legacy_stage_id" IS NOT NULL DO UPDATE SET
    "title" = EXCLUDED."title", "body" = EXCLUDED."body", "content_links" = EXCLUDED."content_links",
    "sort_order" = EXCLUDED."sort_order", "expected_days" = EXCLUDED."expected_days",
    "is_open_ended" = EXCLUDED."is_open_ended", "updated_at" = now();
  INSERT INTO "run_nodes" ("id", "run_id", "source_node_id", "node_type", "title", "body", "content_links", "sort_order", "expected_days", "is_open_ended", "legacy_stage_id")
  SELECT gen_random_uuid(), r."id", c."id", 'phase', NEW."name", NEW."student_description", NEW."content_links", NEW."sort_order", NEW."expected_days", NEW."is_open_ended", NEW."id"
  FROM "program_runs" r
  LEFT JOIN "curriculum_nodes" c ON c."template_id" = r."template_id" AND c."legacy_stage_id" = NEW."id"
  WHERE r."legacy_path_id" = NEW."path_id"
  ON CONFLICT ("run_id", "legacy_stage_id") WHERE "legacy_stage_id" IS NOT NULL DO UPDATE SET
    "title" = EXCLUDED."title", "body" = EXCLUDED."body", "content_links" = EXCLUDED."content_links",
    "sort_order" = EXCLUDED."sort_order", "expected_days" = EXCLUDED."expected_days",
    "is_open_ended" = EXCLUDED."is_open_ended", "updated_at" = now();
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "stages_sync_legacy_program" AFTER INSERT OR UPDATE ON "stages" FOR EACH ROW EXECUTE FUNCTION "programs_sync_legacy_stage"();--> statement-breakpoint
CREATE FUNCTION "programs_sync_legacy_enrollment"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_run uuid;
  v_phase uuid;
  v_status text := CASE NEW."lifecycle_status" WHEN 'graduated' THEN 'completed' ELSE NEW."lifecycle_status" END;
BEGIN
  SELECT r."id", n."id" INTO v_run, v_phase
  FROM "stages" s
  JOIN "program_runs" r ON r."legacy_path_id" = s."path_id"
  JOIN "run_nodes" n ON n."run_id" = r."id" AND n."legacy_stage_id" = s."id"
  WHERE s."id" = NEW."current_stage_id";
  IF v_run IS NULL THEN
    RETURN NULL;
  END IF;
  INSERT INTO "enrollments" ("id", "run_id", "student_id", "status", "paused_until", "current_phase_node_id", "phase_entered_at", "enrolled_at", "completed_at")
  VALUES (gen_random_uuid(), v_run, NEW."user_id", v_status, NEW."paused_until", v_phase, NEW."stage_entered_at", NEW."joined_at",
    CASE WHEN v_status = 'completed' THEN now() END)
  ON CONFLICT ("run_id", "student_id") DO UPDATE SET
    "status" = EXCLUDED."status", "paused_until" = EXCLUDED."paused_until",
    "current_phase_node_id" = EXCLUDED."current_phase_node_id", "phase_entered_at" = EXCLUDED."phase_entered_at",
    "completed_at" = CASE WHEN EXCLUDED."status" = 'completed' THEN coalesce("enrollments"."completed_at", EXCLUDED."completed_at") END,
    "updated_at" = now();
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "students_sync_legacy_enrollment" AFTER INSERT OR UPDATE OF "current_stage_id", "stage_entered_at", "lifecycle_status", "paused_until" ON "students" FOR EACH ROW EXECUTE FUNCTION "programs_sync_legacy_enrollment"();--> statement-breakpoint
-- Creates (or completes) the legacy template, run and enrollments of one organization from
-- its default path. Idempotent: the seed calls it for every organization after every
-- migration, so an organization made by `org:create` gets its legacy program too.
CREATE FUNCTION "ensure_legacy_program"(org uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_path uuid;
  v_template uuid;
  v_run uuid;
  v_fresh boolean := false;
BEGIN
  SELECT "id" INTO v_path FROM "learning_paths" WHERE "organization_id" = org AND "is_default";
  IF v_path IS NULL THEN
    RETURN;
  END IF;

  SELECT "id" INTO v_template FROM "program_templates" WHERE "legacy_path_id" = v_path;
  IF v_template IS NULL THEN
    v_template := gen_random_uuid();
    v_fresh := true;
    INSERT INTO "program_templates" ("id", "organization_id", "kind", "title", "status", "visibility", "extensions", "legacy_path_id")
    VALUES (v_template, org, 'program', 'منتورینگ فریلنسری', 'published', 'organization', '{"freelancing": true}', v_path);
  END IF;
  INSERT INTO "curriculum_nodes" ("id", "template_id", "node_type", "title", "body", "content_links", "sort_order", "expected_days", "is_open_ended", "legacy_stage_id")
  SELECT gen_random_uuid(), v_template, 'phase', s."name", s."student_description", s."content_links", s."sort_order", s."expected_days", s."is_open_ended", s."id"
  FROM "stages" s WHERE s."path_id" = v_path
  ON CONFLICT ("template_id", "legacy_stage_id") WHERE "legacy_stage_id" IS NOT NULL DO NOTHING;
  IF v_fresh THEN
    -- The task templates of each stage become its assignments (copied once).
    INSERT INTO "curriculum_nodes" ("id", "template_id", "parent_id", "node_type", "title", "body", "sort_order", "submission_type", "due_offset_days", "is_required")
    SELECT gen_random_uuid(), v_template, n."id", 'assignment', tt."title", tt."description", tt."sort_order", tt."submission_type", tt."default_due_days", tt."required_for_gate"
    FROM "task_templates" tt
    JOIN "curriculum_nodes" n ON n."template_id" = v_template AND n."legacy_stage_id" = tt."stage_id"
    WHERE tt."organization_id" = org AND tt."is_active";
  END IF;

  SELECT "id" INTO v_run FROM "program_runs" WHERE "legacy_path_id" = v_path;
  IF v_run IS NULL THEN
    v_run := gen_random_uuid();
    INSERT INTO "program_runs" ("id", "organization_id", "template_id", "kind", "mode", "title", "status", "starts_on", "template_revision", "legacy_path_id")
    SELECT v_run, org, v_template, 'program', 'group', t."title", 'active',
      (SELECT (min(st."joined_at") AT TIME ZONE o."timezone")::date FROM "students" st WHERE st."organization_id" = org),
      t."revision", v_path
    FROM "program_templates" t JOIN "organizations" o ON o."id" = t."organization_id"
    WHERE t."id" = v_template;
    INSERT INTO "run_nodes" ("id", "run_id", "source_node_id", "node_type", "title", "body", "content_links", "sort_order", "is_required", "is_gate", "expected_days", "is_open_ended", "due_offset_days", "submission_type", "checklist_items", "legacy_stage_id")
    SELECT gen_random_uuid(), v_run, c."id", c."node_type", c."title", c."body", c."content_links", c."sort_order", c."is_required", c."is_gate", c."expected_days", c."is_open_ended", c."due_offset_days", c."submission_type", c."checklist_items", c."legacy_stage_id"
    FROM "curriculum_nodes" c WHERE c."template_id" = v_template AND c."parent_id" IS NULL;
    INSERT INTO "run_nodes" ("id", "run_id", "parent_id", "source_node_id", "node_type", "title", "body", "content_links", "sort_order", "is_required", "is_gate", "expected_days", "is_open_ended", "due_offset_days", "submission_type", "checklist_items")
    SELECT gen_random_uuid(), v_run, p."id", c."id", c."node_type", c."title", c."body", c."content_links", c."sort_order", c."is_required", c."is_gate", c."expected_days", c."is_open_ended", c."due_offset_days", c."submission_type", c."checklist_items"
    FROM "curriculum_nodes" c
    JOIN "run_nodes" p ON p."run_id" = v_run AND p."source_node_id" = c."parent_id"
    WHERE c."template_id" = v_template;
  ELSE
    INSERT INTO "run_nodes" ("id", "run_id", "source_node_id", "node_type", "title", "body", "content_links", "sort_order", "expected_days", "is_open_ended", "legacy_stage_id")
    SELECT gen_random_uuid(), v_run, c."id", 'phase', c."title", c."body", c."content_links", c."sort_order", c."expected_days", c."is_open_ended", c."legacy_stage_id"
    FROM "curriculum_nodes" c WHERE c."template_id" = v_template AND c."legacy_stage_id" IS NOT NULL
    ON CONFLICT ("run_id", "legacy_stage_id") WHERE "legacy_stage_id" IS NOT NULL DO NOTHING;
  END IF;

  INSERT INTO "enrollments" ("id", "run_id", "student_id", "status", "paused_until", "current_phase_node_id", "phase_entered_at", "enrolled_at", "completed_at")
  SELECT gen_random_uuid(), v_run, st."user_id",
    CASE st."lifecycle_status" WHEN 'graduated' THEN 'completed' ELSE st."lifecycle_status" END,
    st."paused_until", n."id", st."stage_entered_at", st."joined_at",
    CASE WHEN st."lifecycle_status" = 'graduated' THEN st."updated_at" END
  FROM "students" st
  JOIN "run_nodes" n ON n."run_id" = v_run AND n."legacy_stage_id" = st."current_stage_id"
  WHERE st."organization_id" = org
  ON CONFLICT ("run_id", "student_id") DO NOTHING;
END;
$$;--> statement-breakpoint
SELECT "ensure_legacy_program"("id") FROM "organizations";
