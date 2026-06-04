-- B3: normalize/backfill users.native_language (the "base language") to the new
-- 5-locale set. Legacy 2-letter / long-form values map to a locale; anything
-- unrecognized falls back to 'en-US'.
UPDATE "users" SET "native_language" = CASE
  WHEN lower("native_language") IN ('en', 'en-us', 'english') THEN 'en-US'
  WHEN lower("native_language") IN ('zh', 'zh-cn', 'zh-hans', 'chinese') THEN 'zh-CN'
  WHEN lower("native_language") IN ('zh-tw', 'zh-hant') THEN 'zh-TW'
  WHEN lower("native_language") IN ('ko', 'ko-kr', 'korean') THEN 'ko'
  WHEN lower("native_language") IN ('id', 'id-id', 'indonesian', 'bahasa') THEN 'id'
  ELSE 'en-US'
END;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "native_language" SET DEFAULT 'en-US';
