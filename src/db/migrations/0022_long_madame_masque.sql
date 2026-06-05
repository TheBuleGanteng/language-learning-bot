CREATE TABLE "global_api_keys" (
	"provider" text PRIMARY KEY NOT NULL,
	"encrypted_key" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "global_api_keys_provider_check" CHECK ("global_api_keys"."provider" IN ('anthropic', 'openai', 'google'))
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "anthropic_key_ever_set" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "openai_key_ever_set" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "google_key_ever_set" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "global_api_keys" ADD CONSTRAINT "global_api_keys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Backfill the ever-set flags: true for any provider where the user CURRENTLY
-- has a personal key (so existing key-holders aren't eligible for the global key).
UPDATE "user_settings" SET
  "anthropic_key_ever_set" = ("anthropic_api_key_encrypted" IS NOT NULL),
  "openai_key_ever_set" = ("openai_api_key_encrypted" IS NOT NULL),
  "google_key_ever_set" = ("gemini_api_key_encrypted" IS NOT NULL);