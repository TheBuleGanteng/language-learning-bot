CREATE TYPE "public"."ai_feature" AS ENUM('image_gen', 'avatar');--> statement-breakpoint
CREATE TABLE "ai_spend_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"feature" "ai_feature" NOT NULL,
	"cost_usd" numeric(10, 6) NOT NULL,
	"description" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "avatar_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"deck_id" uuid NOT NULL,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 6) DEFAULT '0' NOT NULL,
	"turn_count" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "ai_spend_reminder_usd" numeric(10, 2) DEFAULT '25.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "ai_spend_hard_stop_usd" numeric(10, 2) DEFAULT '100.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_spend_log" ADD CONSTRAINT "ai_spend_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avatar_sessions" ADD CONSTRAINT "avatar_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avatar_sessions" ADD CONSTRAINT "avatar_sessions_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_spend_log_user_month_idx" ON "ai_spend_log" USING btree ("user_id","created_at");