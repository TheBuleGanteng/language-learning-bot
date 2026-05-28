CREATE TABLE "lesson_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_files_kind_check" CHECK ("lesson_files"."kind" IN ('pdf', 'audio'))
);
--> statement-breakpoint
CREATE TABLE "lesson_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"kind" text DEFAULT 'generic' NOT NULL,
	"youtube_video_id" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_links_kind_check" CHECK ("lesson_links"."kind" IN ('generic', 'youtube'))
);
--> statement-breakpoint
ALTER TABLE "lesson_files" ADD CONSTRAINT "lesson_files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_files" ADD CONSTRAINT "lesson_files_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_links" ADD CONSTRAINT "lesson_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_links" ADD CONSTRAINT "lesson_links_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lesson_files_lesson_kind_idx" ON "lesson_files" USING btree ("lesson_id","kind");--> statement-breakpoint
CREATE INDEX "lesson_links_lesson_idx" ON "lesson_links" USING btree ("lesson_id");