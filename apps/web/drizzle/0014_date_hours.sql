ALTER TABLE "availability_exceptions" DROP CONSTRAINT "availability_exceptions_kind_check";--> statement-breakpoint
ALTER TABLE "availability_exceptions" DROP CONSTRAINT "availability_exceptions_range_check";--> statement-breakpoint
ALTER TABLE "mentor_offerings" DROP CONSTRAINT "mentor_offerings_limits_check";--> statement-breakpoint
-- Sprint 7b: a date's rows now replace the weekly hours of that date. `extra` windows become `hours`;
-- a partial `off` has no meaning any more (the date's `hours` rows say when the mentor is free).
UPDATE "availability_exceptions" SET "kind" = 'hours' WHERE "kind" = 'extra';--> statement-breakpoint
DELETE FROM "availability_exceptions" WHERE "kind" = 'off' AND "start_minute" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "mentor_offerings" ALTER COLUMN "horizon_days" SET DEFAULT 60;--> statement-breakpoint
ALTER TABLE "availability_exceptions" ADD COLUMN "template_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_kind_check" CHECK ("availability_exceptions"."kind" IN ('off', 'hours'));--> statement-breakpoint
ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_range_check" CHECK (("availability_exceptions"."kind" = 'off' AND "availability_exceptions"."start_minute" IS NULL AND "availability_exceptions"."end_minute" IS NULL) OR ("availability_exceptions"."kind" = 'hours' AND "availability_exceptions"."start_minute" >= 0 AND "availability_exceptions"."start_minute" < "availability_exceptions"."end_minute" AND "availability_exceptions"."end_minute" <= 1440));--> statement-breakpoint
ALTER TABLE "mentor_offerings" ADD CONSTRAINT "mentor_offerings_limits_check" CHECK ("mentor_offerings"."buffer_minutes" BETWEEN 0 AND 240 AND "mentor_offerings"."min_notice_hours" BETWEEN 0 AND 336 AND "mentor_offerings"."horizon_days" BETWEEN 1 AND 180 AND "mentor_offerings"."cancel_notice_hours" BETWEEN 0 AND 336);