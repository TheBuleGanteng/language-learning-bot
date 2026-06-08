ALTER TABLE "app_settings" ADD COLUMN "session_idle_timeout_seconds" integer DEFAULT 1800 NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "session_warning_seconds" integer DEFAULT 300 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_activity_at" timestamp with time zone DEFAULT now();