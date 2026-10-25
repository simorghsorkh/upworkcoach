-- pg_trgm: trigram search on students.search_text (data-model.md 0). On Azure Flexible Server it must be allow-listed (azure.extensions).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TABLE "learning_paths" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platforms" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"track_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"path_id" uuid NOT NULL,
	"display_code" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer NOT NULL,
	"expected_days" integer,
	"is_open_ended" boolean DEFAULT false NOT NULL,
	"student_description" text,
	"content_links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stages_expected_days_positive" CHECK ("stages"."expected_days" IS NULL OR "stages"."expected_days" > 0)
);
--> statement-breakpoint
CREATE TABLE "tracks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stage_transitions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"student_id" uuid NOT NULL,
	"from_stage_id" uuid,
	"to_stage_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"note" text,
	"actor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stage_transitions_kind_check" CHECK ("stage_transitions"."kind" IN ('initial', 'advance', 'skip_by_assessment', 'advance_with_exception', 'regress')),
	CONSTRAINT "stage_transitions_note_required" CHECK ("stage_transitions"."kind" NOT IN ('advance_with_exception', 'regress') OR ("stage_transitions"."note" IS NOT NULL AND btrim("stage_transitions"."note") <> '')),
	CONSTRAINT "stage_transitions_from_check" CHECK (("stage_transitions"."kind" = 'initial') = ("stage_transitions"."from_stage_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "mentor_assignments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"student_id" uuid NOT NULL,
	"mentor_id" uuid NOT NULL,
	"role" text DEFAULT 'primary' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"assigned_by" uuid,
	"reason" text,
	CONSTRAINT "mentor_assignments_role_check" CHECK ("mentor_assignments"."role" IN ('primary', 'secondary', 'backup'))
);
--> statement-breakpoint
CREATE TABLE "platform_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"student_id" uuid NOT NULL,
	"platform_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"public_url" text,
	"headline" text,
	"rate_amount" numeric(12, 2),
	"rate_currency" char(3),
	"rate_unit" text,
	"status" text DEFAULT 'building' NOT NULL,
	"niche" text,
	"notes" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"mentor_approved_at" timestamp with time zone,
	"mentor_approved_by" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "platform_profiles_kind_check" CHECK ("platform_profiles"."kind" IN ('profile', 'gig', 'linkedin', 'portfolio_page', 'other')),
	CONSTRAINT "platform_profiles_status_check" CHECK ("platform_profiles"."status" IN ('building', 'active', 'restricted', 'suspended')),
	CONSTRAINT "platform_profiles_rate_unit_check" CHECK ("platform_profiles"."rate_unit" IS NULL OR "platform_profiles"."rate_unit" IN ('hour', 'fixed', 'package', 'month')),
	CONSTRAINT "platform_profiles_rate_amount_check" CHECK ("platform_profiles"."rate_amount" IS NULL OR "platform_profiles"."rate_amount" >= 0),
	CONSTRAINT "platform_profiles_https_check" CHECK ("platform_profiles"."public_url" IS NULL OR "platform_profiles"."public_url" LIKE 'https://%')
);
--> statement-breakpoint
CREATE TABLE "profile_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"headline" text,
	"body_text" text NOT NULL,
	"rate_text" text,
	"source_submission_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "students" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"primary_mentor_id" uuid,
	"lifecycle_status" text DEFAULT 'active' NOT NULL,
	"paused_until" date,
	"status_reason" text,
	"current_stage_id" uuid NOT NULL,
	"stage_entered_at" timestamp with time zone NOT NULL,
	"track_id" uuid,
	"primary_platform_id" uuid,
	"level" text,
	"cohort" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"messenger_handle" text,
	"primary_skill" text,
	"skill_level" smallint,
	"english_writing" smallint,
	"english_speaking" smallint,
	"hours_per_week" smallint,
	"income_goal_usd" integer,
	"goal_90d" text,
	"prior_experience" text,
	"self_reported_blocker" text,
	"niche_statement" text,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone,
	"search_text" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_lifecycle_check" CHECK ("students"."lifecycle_status" IN ('active', 'paused', 'graduated', 'dropped')),
	CONSTRAINT "students_paused_until_check" CHECK (("students"."lifecycle_status" = 'paused') = ("students"."paused_until" IS NOT NULL)),
	CONSTRAINT "students_level_check" CHECK ("students"."level" IS NULL OR "students"."level" IN ('beginner', 'applying', 'active', 'advanced')),
	CONSTRAINT "students_prior_experience_check" CHECK ("students"."prior_experience" IS NULL OR "students"."prior_experience" IN ('none', 'applied_no_result', 'few_contracts', 'active')),
	CONSTRAINT "students_scales_check" CHECK (("students"."skill_level" IS NULL OR "students"."skill_level" BETWEEN 1 AND 5)
        AND ("students"."english_writing" IS NULL OR "students"."english_writing" BETWEEN 1 AND 5)
        AND ("students"."english_speaking" IS NULL OR "students"."english_speaking" BETWEEN 1 AND 5)),
	CONSTRAINT "students_numbers_check" CHECK (("students"."hours_per_week" IS NULL OR "students"."hours_per_week" BETWEEN 0 AND 168)
        AND ("students"."income_goal_usd" IS NULL OR "students"."income_goal_usd" >= 0))
);
--> statement-breakpoint
ALTER TABLE "platforms" ADD CONSTRAINT "platforms_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stages" ADD CONSTRAINT "stages_path_id_learning_paths_id_fk" FOREIGN KEY ("path_id") REFERENCES "public"."learning_paths"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_transitions" ADD CONSTRAINT "stage_transitions_student_id_students_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_transitions" ADD CONSTRAINT "stage_transitions_from_stage_id_stages_id_fk" FOREIGN KEY ("from_stage_id") REFERENCES "public"."stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_transitions" ADD CONSTRAINT "stage_transitions_to_stage_id_stages_id_fk" FOREIGN KEY ("to_stage_id") REFERENCES "public"."stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_transitions" ADD CONSTRAINT "stage_transitions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_assignments" ADD CONSTRAINT "mentor_assignments_student_id_students_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_assignments" ADD CONSTRAINT "mentor_assignments_mentor_id_users_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_assignments" ADD CONSTRAINT "mentor_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_profiles" ADD CONSTRAINT "platform_profiles_student_id_students_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_profiles" ADD CONSTRAINT "platform_profiles_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_profiles" ADD CONSTRAINT "platform_profiles_mentor_approved_by_users_id_fk" FOREIGN KEY ("mentor_approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_profiles" ADD CONSTRAINT "platform_profiles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_snapshots" ADD CONSTRAINT "profile_snapshots_profile_id_platform_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."platform_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_snapshots" ADD CONSTRAINT "profile_snapshots_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_primary_mentor_id_users_id_fk" FOREIGN KEY ("primary_mentor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_current_stage_id_stages_id_fk" FOREIGN KEY ("current_stage_id") REFERENCES "public"."stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_primary_platform_id_platforms_id_fk" FOREIGN KEY ("primary_platform_id") REFERENCES "public"."platforms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "learning_paths_one_default" ON "learning_paths" USING btree ("is_default") WHERE "learning_paths"."is_default";--> statement-breakpoint
CREATE UNIQUE INDEX "platforms_name_key" ON "platforms" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "stages_path_order_idx" ON "stages" USING btree ("path_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "tracks_code_key" ON "tracks" USING btree ("code");--> statement-breakpoint
CREATE INDEX "stage_transitions_student_idx" ON "stage_transitions" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mentor_assignments_one_active_primary" ON "mentor_assignments" USING btree ("student_id") WHERE "mentor_assignments"."role" = 'primary' AND "mentor_assignments"."ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX "mentor_assignments_student_idx" ON "mentor_assignments" USING btree ("student_id","started_at");--> statement-breakpoint
CREATE INDEX "platform_profiles_student_idx" ON "platform_profiles" USING btree ("student_id") WHERE "platform_profiles"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "platform_profiles_one_primary" ON "platform_profiles" USING btree ("student_id") WHERE "platform_profiles"."is_primary" AND "platform_profiles"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "profile_snapshots_profile_idx" ON "profile_snapshots" USING btree ("profile_id","created_at");--> statement-breakpoint
CREATE INDEX "students_mentor_lifecycle_idx" ON "students" USING btree ("primary_mentor_id","lifecycle_status");--> statement-breakpoint
CREATE INDEX "students_current_stage_idx" ON "students" USING btree ("current_stage_id");--> statement-breakpoint
CREATE INDEX "students_tags_gin_idx" ON "students" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "students_search_trgm_idx" ON "students" USING gin ("search_text" gin_trgm_ops);