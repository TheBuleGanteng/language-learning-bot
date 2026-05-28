CREATE TABLE "image_generation_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"vocab_item_id" uuid,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"estimated_cost_usd" numeric(10, 6) NOT NULL,
	"status" text NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "image_generation_log_status_check" CHECK ("image_generation_log"."status" IN ('success', 'failed', 'refused'))
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "image_provider" text DEFAULT 'google' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "image_model" text DEFAULT 'imagen-4-fast' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "image_spend_reminder_usd" numeric(8, 2) DEFAULT '25' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "image_spend_hard_stop_usd" numeric(8, 2) DEFAULT '100' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "image_spend_last_reminder_at" text;--> statement-breakpoint
ALTER TABLE "vocab_items" ADD COLUMN "image_storage_key" text;--> statement-breakpoint
ALTER TABLE "vocab_items" ADD COLUMN "image_generated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vocab_items" ADD COLUMN "image_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "vocab_items" ADD COLUMN "image_prompt" text;--> statement-breakpoint
ALTER TABLE "vocab_items" ADD COLUMN "image_prompt_override" text;--> statement-breakpoint
ALTER TABLE "vocab_items" ADD COLUMN "image_provider" text;--> statement-breakpoint
ALTER TABLE "vocab_items" ADD COLUMN "image_model" text;--> statement-breakpoint
ALTER TABLE "image_generation_log" ADD CONSTRAINT "image_generation_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_generation_log" ADD CONSTRAINT "image_generation_log_vocab_item_id_vocab_items_id_fk" FOREIGN KEY ("vocab_item_id") REFERENCES "public"."vocab_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "img_gen_log_user_month_idx" ON "image_generation_log" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "vocab_items" ADD CONSTRAINT "vocab_items_image_status_check" CHECK ("vocab_items"."image_status" IN ('none', 'generating', 'completed', 'refused', 'failed'));