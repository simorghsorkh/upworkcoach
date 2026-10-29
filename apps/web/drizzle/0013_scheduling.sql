CREATE TABLE "availability_exceptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"mentor_id" uuid NOT NULL,
	"day" date NOT NULL,
	"kind" text NOT NULL,
	"start_minute" integer,
	"end_minute" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_exceptions_kind_check" CHECK ("availability_exceptions"."kind" IN ('off', 'extra')),
	CONSTRAINT "availability_exceptions_range_check" CHECK (("availability_exceptions"."start_minute" IS NULL AND "availability_exceptions"."end_minute" IS NULL AND "availability_exceptions"."kind" = 'off') OR ("availability_exceptions"."start_minute" >= 0 AND "availability_exceptions"."start_minute" < "availability_exceptions"."end_minute" AND "availability_exceptions"."end_minute" <= 1440))
);
--> statement-breakpoint
CREATE TABLE "availability_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"mentor_id" uuid NOT NULL,
	"weekday" text NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	"template_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_rules_weekday_check" CHECK ("availability_rules"."weekday" IN ('sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri')),
	CONSTRAINT "availability_rules_range_check" CHECK ("availability_rules"."start_minute" >= 0 AND "availability_rules"."start_minute" < "availability_rules"."end_minute" AND "availability_rules"."end_minute" <= 1440)
);
--> statement-breakpoint
CREATE TABLE "booking_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"mentor_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"enrollment_id" uuid,
	"scheduled_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"hold_until" timestamp with time zone NOT NULL,
	"note" text,
	"session_id" uuid,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decline_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_requests_status_check" CHECK ("booking_requests"."status" IN ('pending', 'approved', 'declined', 'cancelled')),
	CONSTRAINT "booking_requests_duration_check" CHECK ("booking_requests"."duration_minutes" > 0 AND "booking_requests"."duration_minutes" <= 600)
);
--> statement-breakpoint
CREATE TABLE "mentor_offerings" (
	"organization_id" uuid NOT NULL,
	"mentor_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"buffer_minutes" integer DEFAULT 15 NOT NULL,
	"min_notice_hours" integer DEFAULT 12 NOT NULL,
	"horizon_days" integer DEFAULT 21 NOT NULL,
	"cancel_notice_hours" integer DEFAULT 24 NOT NULL,
	"location" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentor_offerings_mentor_id_template_id_pk" PRIMARY KEY("mentor_id","template_id"),
	CONSTRAINT "mentor_offerings_limits_check" CHECK ("mentor_offerings"."buffer_minutes" BETWEEN 0 AND 240 AND "mentor_offerings"."min_notice_hours" BETWEEN 0 AND 336 AND "mentor_offerings"."horizon_days" BETWEEN 1 AND 90 AND "mentor_offerings"."cancel_notice_hours" BETWEEN 0 AND 336)
);
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_kind_check";--> statement-breakpoint
ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_mentor_id_users_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_mentor_id_users_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_mentor_id_users_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_template_id_program_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."program_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_session_id_mentoring_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."mentoring_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_offerings" ADD CONSTRAINT "mentor_offerings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_offerings" ADD CONSTRAINT "mentor_offerings_mentor_id_users_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_offerings" ADD CONSTRAINT "mentor_offerings_template_id_program_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."program_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "availability_exceptions_mentor_idx" ON "availability_exceptions" USING btree ("organization_id","mentor_id","day");--> statement-breakpoint
CREATE INDEX "availability_rules_mentor_idx" ON "availability_rules" USING btree ("organization_id","mentor_id");--> statement-breakpoint
CREATE INDEX "booking_requests_mentor_idx" ON "booking_requests" USING btree ("organization_id","mentor_id","scheduled_at") WHERE "booking_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "booking_requests_student_idx" ON "booking_requests" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE INDEX "mentor_offerings_org_idx" ON "mentor_offerings" USING btree ("organization_id","mentor_id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_kind_check" CHECK ("notifications"."kind" IN ('task_assigned', 'task_reviewed', 'task_submitted', 'question_new', 'question_reply', 'session_scheduled', 'booking_requested', 'booking_decided', 'booking_cancelled'));