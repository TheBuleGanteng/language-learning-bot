CREATE TABLE "image_generation_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"requested_count" integer NOT NULL,
	"succeeded_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"refused_count" integer DEFAULT 0 NOT NULL,
	"stopped" boolean DEFAULT false NOT NULL,
	"notification_dismissed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "image_generation_batches" ADD CONSTRAINT "image_generation_batches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "image_gen_batches_user_idx" ON "image_generation_batches" USING btree ("user_id","started_at");