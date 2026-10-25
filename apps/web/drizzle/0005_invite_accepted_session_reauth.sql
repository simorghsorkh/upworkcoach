ALTER TABLE "sessions" ADD COLUMN "reauth_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "invite_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "invite_accepted_user_agent" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_invite_accepted_user_agent_length" CHECK (char_length("users"."invite_accepted_user_agent") <= 512);--> statement-breakpoint
-- Hand-written data step (followup F-01): copy «invite accepted» from consumed invite tokens
-- that auth.cleanup has not deleted yet (latest per user). Erased users keep no User-Agent.
UPDATE "users" AS u
SET "invite_accepted_at" = t."used_at",
    "invite_accepted_user_agent" = CASE WHEN u."erased_at" IS NULL THEN left(t."used_user_agent", 512) END
FROM (
  SELECT DISTINCT ON ("user_id") "user_id", "used_at", "used_user_agent"
  FROM "auth_tokens"
  WHERE "purpose" = 'invite' AND "used_at" IS NOT NULL
  ORDER BY "user_id", "used_at" DESC
) AS t
WHERE t."user_id" = u."id" AND u."invite_accepted_at" IS NULL;
