CREATE TABLE "app_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"avatar_inactivity_timeout_seconds" integer DEFAULT 120 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "app_settings" ("id", "avatar_inactivity_timeout_seconds")
VALUES (1, 120)
ON CONFLICT ("id") DO NOTHING;
