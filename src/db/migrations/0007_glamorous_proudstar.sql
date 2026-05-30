ALTER TABLE "vocab_items" ADD COLUMN "target_text_normalized" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "vocab_items" ADD COLUMN "native_text_normalized" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX "vocab_target_normalized_idx" ON "vocab_items" USING btree ("target_text_normalized");--> statement-breakpoint
CREATE INDEX "vocab_native_normalized_idx" ON "vocab_items" USING btree ("native_text_normalized");