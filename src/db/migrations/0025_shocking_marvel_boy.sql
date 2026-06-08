CREATE TABLE "lesson_order" (
	"user_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"position" double precision NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_order_user_id_lesson_id_pk" PRIMARY KEY("user_id","lesson_id")
);
--> statement-breakpoint
CREATE TABLE "vocab_order" (
	"user_id" uuid NOT NULL,
	"vocab_item_id" uuid NOT NULL,
	"position" double precision NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vocab_order_user_id_vocab_item_id_pk" PRIMARY KEY("user_id","vocab_item_id")
);
--> statement-breakpoint
ALTER TABLE "lesson_order" ADD CONSTRAINT "lesson_order_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_order" ADD CONSTRAINT "lesson_order_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocab_order" ADD CONSTRAINT "vocab_order_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocab_order" ADD CONSTRAINT "vocab_order_vocab_item_id_vocab_items_id_fk" FOREIGN KEY ("vocab_item_id") REFERENCES "public"."vocab_items"("id") ON DELETE cascade ON UPDATE no action;