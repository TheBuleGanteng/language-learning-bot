CREATE TABLE "vocab_comprehension" (
	"user_id" uuid NOT NULL,
	"vocab_item_id" uuid NOT NULL,
	"level" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vocab_comprehension_user_id_vocab_item_id_pk" PRIMARY KEY("user_id","vocab_item_id"),
	CONSTRAINT "vocab_comprehension_level_check" CHECK ("vocab_comprehension"."level" IN ('not_tested', 'low', 'medium', 'high'))
);
--> statement-breakpoint
CREATE TABLE "vocab_stars" (
	"user_id" uuid NOT NULL,
	"vocab_item_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vocab_stars_user_id_vocab_item_id_pk" PRIMARY KEY("user_id","vocab_item_id")
);
--> statement-breakpoint
ALTER TABLE "vocab_comprehension" ADD CONSTRAINT "vocab_comprehension_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocab_comprehension" ADD CONSTRAINT "vocab_comprehension_vocab_item_id_vocab_items_id_fk" FOREIGN KEY ("vocab_item_id") REFERENCES "public"."vocab_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocab_stars" ADD CONSTRAINT "vocab_stars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocab_stars" ADD CONSTRAINT "vocab_stars_vocab_item_id_vocab_items_id_fk" FOREIGN KEY ("vocab_item_id") REFERENCES "public"."vocab_items"("id") ON DELETE cascade ON UPDATE no action;