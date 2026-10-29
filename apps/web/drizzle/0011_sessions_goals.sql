CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"target_date" date,
	"status" text DEFAULT 'open' NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goals_status_check" CHECK ("goals"."status" IN ('open', 'achieved', 'dropped'))
);
--> statement-breakpoint
CREATE TABLE "mentoring_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"enrollment_id" uuid,
	"mentor_id" uuid NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer NOT NULL,
	"location" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"counts_toward_quota" boolean DEFAULT true NOT NULL,
	"cancelled_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentoring_sessions_status_check" CHECK ("mentoring_sessions"."status" IN ('scheduled', 'held', 'cancelled', 'no_show')),
	CONSTRAINT "mentoring_sessions_duration_check" CHECK ("mentoring_sessions"."duration_minutes" > 0 AND "mentoring_sessions"."duration_minutes" <= 600)
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoring_sessions" ADD CONSTRAINT "mentoring_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoring_sessions" ADD CONSTRAINT "mentoring_sessions_run_id_program_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."program_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoring_sessions" ADD CONSTRAINT "mentoring_sessions_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoring_sessions" ADD CONSTRAINT "mentoring_sessions_mentor_id_users_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoring_sessions" ADD CONSTRAINT "mentoring_sessions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goals_enrollment_idx" ON "goals" USING btree ("enrollment_id");--> statement-breakpoint
CREATE INDEX "mentoring_sessions_run_idx" ON "mentoring_sessions" USING btree ("run_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "mentoring_sessions_mentor_idx" ON "mentoring_sessions" USING btree ("mentor_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "mentoring_sessions_enrollment_idx" ON "mentoring_sessions" USING btree ("enrollment_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_session_id_mentoring_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."mentoring_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_session_idx" ON "tasks" USING btree ("session_id");--> statement-breakpoint
-- Coach Office sprint 5b: organization of a session comes from its run, of a goal from its enrollment (ADR-0011).
CREATE TRIGGER "mentoring_sessions_set_organization_id" BEFORE INSERT OR UPDATE OF "run_id", "organization_id" ON "mentoring_sessions" FOR EACH ROW EXECUTE FUNCTION "set_organization_id"('program_runs', 'id', 'run_id');--> statement-breakpoint
CREATE TRIGGER "goals_set_organization_id" BEFORE INSERT OR UPDATE OF "enrollment_id", "organization_id" ON "goals" FOR EACH ROW EXECUTE FUNCTION "set_organization_id"('enrollments', 'id', 'enrollment_id');
