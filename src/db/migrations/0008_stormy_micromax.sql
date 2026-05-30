CREATE TYPE "public"."user_role" AS ENUM('regular', 'admin', 'superuser');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('private', 'shared');--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "visibility" "visibility" DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "tags" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "tags" ADD COLUMN "visibility" "visibility" DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "user_role" DEFAULT 'regular' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "display_name" varchar(50);--> statement-breakpoint
ALTER TABLE "vocab_items" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "vocab_items" ADD COLUMN "visibility" "visibility" DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocab_items" ADD CONSTRAINT "vocab_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vocab_items_created_by_idx" ON "vocab_items" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "vocab_items_visibility_idx" ON "vocab_items" USING btree ("visibility");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_display_name_unique" UNIQUE("display_name");--> statement-breakpoint
-- Feature A backfill ---------------------------------------------------------
-- Make Matt the superuser.
UPDATE "users" SET "role" = 'superuser' WHERE "email" = 'matt@mattmcdonnell.net';--> statement-breakpoint
-- Attribute all existing content to Matt.
UPDATE "vocab_items" SET "created_by" = (SELECT "id" FROM "users" WHERE "email" = 'matt@mattmcdonnell.net') WHERE "created_by" IS NULL;--> statement-breakpoint
UPDATE "lessons" SET "created_by" = (SELECT "id" FROM "users" WHERE "email" = 'matt@mattmcdonnell.net') WHERE "created_by" IS NULL;--> statement-breakpoint
UPDATE "tags" SET "created_by" = (SELECT "id" FROM "users" WHERE "email" = 'matt@mattmcdonnell.net') WHERE "created_by" IS NULL;--> statement-breakpoint
-- Existing content is shared by default (the feature flips new content to private).
UPDATE "vocab_items" SET "visibility" = 'shared';--> statement-breakpoint
UPDATE "lessons" SET "visibility" = 'shared';--> statement-breakpoint
UPDATE "tags" SET "visibility" = 'shared';--> statement-breakpoint
-- Remove leftover test accounts.
DELETE FROM "users" WHERE "email" IN ('e2e+1779899874815@example.com', 'diagtest@example.com');