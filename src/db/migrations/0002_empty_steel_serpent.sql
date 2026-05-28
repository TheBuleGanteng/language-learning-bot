ALTER TABLE "users" ALTER COLUMN "target_language" SET DEFAULT 'th';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "native_language" SET DEFAULT 'en';--> statement-breakpoint
UPDATE "users" SET "target_language" = CASE LOWER("target_language")
  WHEN 'thai' THEN 'th'
  WHEN 'english' THEN 'en'
  WHEN 'chinese' THEN 'zh'
  WHEN 'japanese' THEN 'ja'
  WHEN 'spanish' THEN 'es'
  WHEN 'french' THEN 'fr'
  WHEN 'german' THEN 'de'
  ELSE "target_language"
END;--> statement-breakpoint
UPDATE "users" SET "native_language" = CASE LOWER("native_language")
  WHEN 'thai' THEN 'th'
  WHEN 'english' THEN 'en'
  WHEN 'chinese' THEN 'zh'
  WHEN 'japanese' THEN 'ja'
  WHEN 'spanish' THEN 'es'
  WHEN 'french' THEN 'fr'
  WHEN 'german' THEN 'de'
  ELSE "native_language"
END;