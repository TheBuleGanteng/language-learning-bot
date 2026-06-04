CREATE TYPE "public"."gloss_source" AS ENUM('original', 'machine');--> statement-breakpoint
CREATE TABLE "vocab_item_glosses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vocab_item_id" uuid NOT NULL,
	"base_language" varchar(8) NOT NULL,
	"text" text NOT NULL,
	"source" "gloss_source" DEFAULT 'machine' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vocab_item_glosses_item_lang_unique" UNIQUE("vocab_item_id","base_language")
);
--> statement-breakpoint
ALTER TABLE "vocab_items" ADD COLUMN "native_language" text DEFAULT 'en-US' NOT NULL;--> statement-breakpoint
ALTER TABLE "vocab_item_glosses" ADD CONSTRAINT "vocab_item_glosses_vocab_item_id_vocab_items_id_fk" FOREIGN KEY ("vocab_item_id") REFERENCES "public"."vocab_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- C2: pin each existing item's native_language from its creator's (already
-- normalized) base language; items with no creator stay 'en-US'.
UPDATE "vocab_items" v
SET "native_language" = u."native_language"
FROM "users" u
WHERE v."created_by" = u."id";