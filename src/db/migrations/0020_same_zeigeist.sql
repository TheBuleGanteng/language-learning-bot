ALTER TABLE "lesson_files" ADD COLUMN "visibility" "visibility" DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_links" ADD COLUMN "visibility" "visibility" DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "disabled_at" timestamp with time zone;--> statement-breakpoint
-- Backfill per-material visibility from each row's parent lesson so current
-- behavior is preserved (a shared lesson's existing files/links become shared).
UPDATE "lesson_files" AS lf SET "visibility" = l."visibility" FROM "lessons" AS l WHERE l."id" = lf."lesson_id";--> statement-breakpoint
UPDATE "lesson_links" AS ll SET "visibility" = l."visibility" FROM "lessons" AS l WHERE l."id" = ll."lesson_id";