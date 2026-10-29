CREATE TABLE "node_completions" (
	"organization_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"run_node_id" uuid NOT NULL,
	"checklist_state" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "node_completions_enrollment_id_run_node_id_pk" PRIMARY KEY("enrollment_id","run_node_id")
);
--> statement-breakpoint
ALTER TABLE "curriculum_nodes" ADD COLUMN "milestone_type_id" uuid;--> statement-breakpoint
ALTER TABLE "run_nodes" ADD COLUMN "milestone_type_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "enrollment_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "node_id" uuid;--> statement-breakpoint
ALTER TABLE "node_completions" ADD CONSTRAINT "node_completions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_completions" ADD CONSTRAINT "node_completions_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_completions" ADD CONSTRAINT "node_completions_run_node_id_run_nodes_id_fk" FOREIGN KEY ("run_node_id") REFERENCES "public"."run_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_completions" ADD CONSTRAINT "node_completions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_nodes" ADD CONSTRAINT "curriculum_nodes_milestone_type_id_milestone_types_id_fk" FOREIGN KEY ("milestone_type_id") REFERENCES "public"."milestone_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_nodes" ADD CONSTRAINT "run_nodes_milestone_type_id_milestone_types_id_fk" FOREIGN KEY ("milestone_type_id") REFERENCES "public"."milestone_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_node_id_run_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."run_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_enrollment_node_key" ON "tasks" USING btree ("enrollment_id","node_id") WHERE "tasks"."node_id" IS NOT NULL AND "tasks"."status" <> 'cancelled';--> statement-breakpoint
CREATE INDEX "tasks_enrollment_idx" ON "tasks" USING btree ("enrollment_id");--> statement-breakpoint
-- Coach Office sprint 5: organization of a completion comes from its enrollment (ADR-0011).
CREATE TRIGGER "node_completions_set_organization_id" BEFORE INSERT OR UPDATE OF "enrollment_id", "organization_id" ON "node_completions" FOR EACH ROW EXECUTE FUNCTION "set_organization_id"('enrollments', 'id', 'enrollment_id');
