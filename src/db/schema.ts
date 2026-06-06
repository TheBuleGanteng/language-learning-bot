import {
  pgTable,
  pgEnum,
  text,
  varchar,
  timestamp,
  uuid,
  integer,
  real,
  date,
  numeric,
  boolean,
  primaryKey,
  uniqueIndex,
  unique,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// =============================================================================
// enums — role-based admin + content visibility (Feature A)
// =============================================================================

export const userRoleEnum = pgEnum('user_role', ['regular', 'admin', 'superuser']);
export const visibilityEnum = pgEnum('visibility', ['private', 'shared']);
// Per-lesson link collections (item 4–7). 'general' is the original "Useful
// Links" accordion; the rest are dedicated resource sections.
export const linkCategoryEnum = pgEnum('link_category', [
  'general',
  'dls_audio',
  'quizlet',
  'dls_exercises',
]);

// =============================================================================
// users
// =============================================================================

export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  targetLanguage: text('target_language').notNull().default('th'),
  // Base language = the user's own language. Now holds one of the 5 UI locales
  // (src/lib/locales.ts): 'en-US' | 'zh-CN' | 'zh-TW' | 'ko' | 'id'. Drives the
  // UI locale, the captions "base" translation target, and per-base-language
  // vocab glosses. (Field name kept as `nativeLanguage` to avoid a column
  // rename; the migration backfills legacy 2-letter values.)
  nativeLanguage: text('native_language').notNull().default('en-US'),
  // Role-based admin (Feature A). Display name is the public identity shown on
  // shared content; nullable until the user sets one, unique (case-insensitive
  // uniqueness is enforced in the API).
  role: userRoleEnum('role').notNull().default('regular'),
  displayName: varchar('display_name', { length: 50 }).unique(),
  // Bumped on password reset / "sign out everywhere". JWTs whose `iat` is
  // earlier than this timestamp are rejected in the auth callback. This is
  // how we invalidate sessions under a stateless JWT strategy.
  sessionsInvalidatedAt: timestamp('sessions_invalidated_at', { withTimezone: true }),
  // Account disable (superuser user-management). NULL = active; non-null =
  // disabled at that time. Login is rejected for disabled accounts (auth.ts),
  // and the jwt callback forces an already-logged-in disabled user out.
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// =============================================================================
// verification_tokens (our own — for email verify + password reset)
// =============================================================================

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    purpose: text('purpose').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('verification_tokens_token_hash_purpose_idx').on(t.tokenHash, t.purpose),
    check(
      'verification_tokens_purpose_check',
      sql`${t.purpose} IN ('email_verify', 'password_reset')`,
    ),
  ],
);

// =============================================================================
// Auth.js Drizzle adapter tables (canonical schema)
// Renamed Auth.js's "verificationToken" table to auth_verification_tokens to
// avoid collision with our own verification_tokens above.
// =============================================================================

export const accounts = pgTable(
  'accounts',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refreshToken: text('refresh_token'),
    accessToken: text('access_token'),
    expiresAt: integer('expires_at'),
    tokenType: text('token_type'),
    scope: text('scope'),
    idToken: text('id_token'),
    sessionState: text('session_state'),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { withTimezone: true }).notNull(),
});

export const authVerificationTokens = pgTable(
  'auth_verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// =============================================================================
// user_settings
// =============================================================================

export const userSettings = pgTable('user_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  llmProvider: text('llm_provider').notNull().default('anthropic'),
  llmModel: text('llm_model').notNull().default('claude-sonnet-4-6'),
  anthropicApiKeyEncrypted: text('anthropic_api_key_encrypted'),
  openaiApiKeyEncrypted: text('openai_api_key_encrypted'),
  geminiApiKeyEncrypted: text('gemini_api_key_encrypted'),
  // "Has this user ever set a personal key for this provider?" — drives global-
  // key eligibility. Set true permanently when a personal key is saved; deleting
  // a personal key does NOT clear it, so set-then-deleted users don't fall back
  // to the global key. (`google` flag tracks the Gemini column.)
  anthropicKeyEverSet: boolean('anthropic_key_ever_set').notNull().default(false),
  openaiKeyEverSet: boolean('openai_key_ever_set').notNull().default(false),
  googleKeyEverSet: boolean('google_key_ever_set').notNull().default(false),
  imageProvider: text('image_provider').notNull().default('google'),
  imageModel: text('image_model').notNull().default('imagen-4-fast'),
  extractionProvider: text('extraction_provider').notNull().default('anthropic'),
  extractionModel: text('extraction_model').notNull().default('claude-opus-4-7'),
  // AI Voice Chat (Kruu Bingo) realtime speech-to-speech model. Per-user, like
  // the image model. Must be a value from src/lib/voice-models.ts.
  voiceModel: varchar('voice_model', { length: 64 }).notNull().default('gpt-realtime'),
  // How much the AI tutor mixes the user's base (native) language into the
  // conversation. One of src/lib/base-language-use.ts levels:
  // 'all' | 'frequent' | 'moderate' | 'rarely' | 'never'.
  baseLanguageUse: varchar('base_language_use', { length: 16 })
    .notNull()
    .default('moderate'),
  // How fast the AI tutor speaks. One of src/lib/speech-speed.ts levels:
  // 'slow' | 'moderate' | 'native'. Applied via a pacing instruction injected
  // into the realtime session prompt (NOT the OpenAI `speed` param).
  speechSpeed: varchar('speech_speed', { length: 16 }).notNull().default('moderate'),
  // Show captions (transcript) during AI voice chat. Per-user, default OFF.
  captionsEnabled: boolean('captions_enabled').notNull().default(false),
  // Caption language mode: 'base' (translate to base language via Google),
  // 'target' (raw target-language transcript), 'target_romanized' (LLM
  // transliteration). Default 'target'.
  captionLanguage: varchar('caption_language', { length: 24 }).notNull().default('target'),
  // Per-user text model used for caption romanization (src/lib/romanization-models.ts).
  romanizationModel: varchar('romanization_model', { length: 64 })
    .notNull()
    .default('claude-haiku-4-5'),
  // Feature C: spend caps now cover ALL AI features (image gen + avatar), not
  // just image generation.
  aiSpendReminderUsd: numeric('ai_spend_reminder_usd', { precision: 10, scale: 2 })
    .notNull()
    .default('25.00'),
  aiSpendHardStopUsd: numeric('ai_spend_hard_stop_usd', { precision: 10, scale: 2 })
    .notNull()
    .default('100.00'),
  // Format: "{YYYY-MM}:{amount}". Null until the first reminder fires this
  // month. On read, if the YYYY-MM prefix doesn't match the current month,
  // treat the band as 0 — no separate "reset at month boundary" job needed.
  imageSpendLastReminderAt: text('image_spend_last_reminder_at'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// =============================================================================
// global_api_keys — one superuser-managed encrypted key per provider, used as a
// fallback for eligible users (never exposed to non-superusers). Encrypted with
// APP_ENCRYPTION_KEY exactly like personal keys.
// =============================================================================

export const globalApiKeys = pgTable(
  'global_api_keys',
  {
    // provider id — one row per provider (the PK enforces uniqueness).
    provider: text('provider').primaryKey(),
    encryptedKey: text('encrypted_key').notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('global_api_keys_provider_check', sql`${t.provider} IN ('anthropic', 'openai', 'google')`),
  ],
);

// =============================================================================
// lessons
// =============================================================================

export const lessons = pgTable(
  'lessons',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    lessonNumber: integer('lesson_number'),
    topic: text('topic'),
    date: date('date'),
    // Feature A: original author + share visibility.
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    visibility: visibilityEnum('visibility').notNull().default('private'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('lessons_user_id_name_unique').on(t.userId, t.name)],
);

// =============================================================================
// tags
// =============================================================================

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color'),
    // Feature A: original author + share visibility.
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    visibility: visibilityEnum('visibility').notNull().default('private'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('tags_user_id_name_unique').on(t.userId, t.name)],
);

// =============================================================================
// vocab_items
// =============================================================================

export const vocabItems = pgTable(
  'vocab_items',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetText: text('target_text').notNull(),
    nativeText: text('native_text').notNull(),
    // C2: the LANGUAGE (base-language locale) the native/meaning text is written
    // in — pinned from the creator's base language at creation. Translated
    // glosses for OTHER base languages live in vocab_item_glosses.
    nativeLanguage: text('native_language').notNull().default('en-US'),
    // Accent-agnostic search columns: targetText/nativeText run through
    // normalizeText() (strip diacritics, map IPA → Latin, lowercase).
    targetTextNormalized: text('target_text_normalized').notNull().default(''),
    nativeTextNormalized: text('native_text_normalized').notNull().default(''),
    transliteration: text('transliteration'),
    pos: text('pos'),
    exampleTarget: text('example_target'),
    exampleNative: text('example_native'),
    notes: text('notes'),
    imageStorageKey: text('image_storage_key'),
    imageGeneratedAt: timestamp('image_generated_at', { withTimezone: true }),
    imageStatus: text('image_status').notNull().default('none'),
    imagePrompt: text('image_prompt'),
    imagePromptOverride: text('image_prompt_override'),
    imageProvider: text('image_provider'),
    imageModel: text('image_model'),
    // Feature A: original author + share visibility.
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    visibility: visibilityEnum('visibility').notNull().default('private'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('vocab_items_user_created_idx').on(t.userId, t.createdAt.desc()),
    index('vocab_items_created_by_idx').on(t.createdBy),
    index('vocab_items_visibility_idx').on(t.visibility),
    index('vocab_target_normalized_idx').on(t.targetTextNormalized),
    index('vocab_native_normalized_idx').on(t.nativeTextNormalized),
    check(
      'vocab_items_image_status_check',
      sql`${t.imageStatus} IN ('none', 'generating', 'completed', 'refused', 'failed')`,
    ),
  ],
);

// =============================================================================
// vocab_tags (M:N)
// =============================================================================

export const vocabTags = pgTable(
  'vocab_tags',
  {
    vocabItemId: uuid('vocab_item_id')
      .notNull()
      .references(() => vocabItems.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.vocabItemId, t.tagId] })],
);

// =============================================================================
// vocab_lessons (M:N — usually 1:1 but modeled as M:N for flexibility)
// =============================================================================

export const vocabLessons = pgTable(
  'vocab_lessons',
  {
    vocabItemId: uuid('vocab_item_id')
      .notNull()
      .references(() => vocabItems.id, { onDelete: 'cascade' }),
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.vocabItemId, t.lessonId] })],
);

// =============================================================================
// vocab_item_glosses — per-base-language translations of a vocab item's native
// meaning (C2). Keyed by (item, base_language), NOT by user, so a translation
// is produced once per language and reused across all users/sessions.
// =============================================================================

export const glossSourceEnum = pgEnum('gloss_source', ['original', 'machine']);

export const vocabItemGlosses = pgTable(
  'vocab_item_glosses',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    vocabItemId: uuid('vocab_item_id')
      .notNull()
      .references(() => vocabItems.id, { onDelete: 'cascade' }),
    // The base-language locale this gloss is written in (e.g. 'ko', 'zh-CN').
    baseLanguage: varchar('base_language', { length: 8 }).notNull(),
    text: text('text').notNull(),
    // 'original' = the creator's canonical meaning; 'machine' = auto-translated.
    source: glossSourceEnum('source').notNull().default('machine'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('vocab_item_glosses_item_lang_unique').on(t.vocabItemId, t.baseLanguage)],
);

// =============================================================================
// lesson_files (PDFs + audio attached to a lesson)
// =============================================================================

export const lessonFiles = pgTable(
  'lesson_files',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    storageKey: text('storage_key').notNull(),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    // Per-material sharing (granular lesson sharing). Backfilled from the parent
    // lesson's visibility. A non-owner viewing a shared lesson sees only files
    // whose visibility is 'shared'.
    visibility: visibilityEnum('visibility').notNull().default('private'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('lesson_files_lesson_kind_idx').on(t.lessonId, t.kind),
    check('lesson_files_kind_check', sql`${t.kind} IN ('pdf', 'audio', 'image')`),
  ],
);

// =============================================================================
// lesson_links (useful links — generic URLs + YouTube embeds)
// =============================================================================

export const lessonLinks = pgTable(
  'lesson_links',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    title: text('title').notNull(),
    notes: text('notes'),
    kind: text('kind').notNull().default('generic'),
    youtubeVideoId: text('youtube_video_id'),
    // Which per-lesson collection this link belongs to (item 4–7). Existing
    // rows backfill to 'general' (the original Useful Links accordion).
    category: linkCategoryEnum('category').notNull().default('general'),
    position: integer('position').notNull().default(0),
    // Per-material sharing (granular lesson sharing). Backfilled from the parent
    // lesson's visibility.
    visibility: visibilityEnum('visibility').notNull().default('private'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('lesson_links_lesson_idx').on(t.lessonId),
    check('lesson_links_kind_check', sql`${t.kind} IN ('generic', 'youtube')`),
  ],
);

// =============================================================================
// ai_spend_log (consolidated cost tracking across all AI features — Feature C,
// replaces image_generation_log)
// =============================================================================

export const aiFeatureEnum = pgEnum('ai_feature', ['image_gen', 'avatar']);

export const aiSpendLog = pgTable(
  'ai_spend_log',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    feature: aiFeatureEnum('feature').notNull(),
    // Cost in USD.
    costUsd: numeric('cost_usd', { precision: 10, scale: 6 }).notNull(),
    // Human-readable, e.g. "imagen-4-fast 1 image" or "realtime 45s".
    description: varchar('description', { length: 200 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ai_spend_log_user_month_idx').on(t.userId, t.createdAt)],
);

// =============================================================================
// image_generation_batches (cross-page completion notification + history)
// =============================================================================

export const imageGenerationBatches = pgTable(
  'image_generation_batches',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    requestedCount: integer('requested_count').notNull(),
    succeededCount: integer('succeeded_count').notNull().default(0),
    failedCount: integer('failed_count').notNull().default(0),
    refusedCount: integer('refused_count').notNull().default(0),
    stopped: boolean('stopped').notNull().default(false),
    // Stamped when the client confirms it has shown the completion popup.
    // While null and finishedAt is set, the active-batch endpoint surfaces
    // this row as a pendingNotification so the client can pop the dialog.
    notificationDismissedAt: timestamp('notification_dismissed_at', {
      withTimezone: true,
    }),
  },
  (t) => [index('image_gen_batches_user_idx').on(t.userId, t.startedAt)],
);

// =============================================================================
// item_performance (placeholder for FSRS — schema only, not written to in v1)
// =============================================================================

export const itemPerformance = pgTable(
  'item_performance',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    vocabItemId: uuid('vocab_item_id')
      .notNull()
      .references(() => vocabItems.id, { onDelete: 'cascade' }),
    stability: real('stability'),
    difficulty: real('difficulty'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    lastReviewAt: timestamp('last_review_at', { withTimezone: true }),
    reps: integer('reps').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    state: text('state').notNull().default('new'),
  },
  (t) => [
    uniqueIndex('item_performance_user_vocab_unique').on(t.userId, t.vocabItemId),
    check(
      'item_performance_state_check',
      sql`${t.state} IN ('new', 'learning', 'review', 'relearning')`,
    ),
  ],
);

// =============================================================================
// flashcards — decks, deck items, per-card FSRS state, study sessions (Feature B)
// =============================================================================

export const deckSourceEnum = pgEnum('deck_source', ['tag', 'lesson', 'manual']);
export const cardDirectionEnum = pgEnum('card_direction', ['forward', 'reverse', 'both']);
// One row of card_reviews is a single studied face; 'both' decks expand into
// one forward + one reverse review per vocab item.
export const cardDirectionSideEnum = pgEnum('card_direction_side', ['forward', 'reverse']);

export const decks = pgTable(
  'decks',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    source: deckSourceEnum('source').notNull(),
    // For tag/lesson sources: the source ID. Null for manual decks.
    sourceId: uuid('source_id'),
    // forward = native→target, reverse = target→native, both = interleaved.
    direction: cardDirectionEnum('direction').notNull().default('forward'),
    lastStudiedAt: timestamp('last_studied_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('decks_user_last_studied_idx').on(t.userId, t.lastStudiedAt)],
);

// Static snapshot of the vocab in a deck.
export const deckItems = pgTable(
  'deck_items',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    deckId: uuid('deck_id')
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    vocabItemId: uuid('vocab_item_id')
      .notNull()
      .references(() => vocabItems.id, { onDelete: 'cascade' }),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('deck_items_deck_vocab_unique').on(t.deckId, t.vocabItemId)],
);

// Per-deck FSRS state — one row per deck+vocabItem+direction.
export const cardReviews = pgTable(
  'card_reviews',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    deckId: uuid('deck_id')
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    vocabItemId: uuid('vocab_item_id')
      .notNull()
      .references(() => vocabItems.id, { onDelete: 'cascade' }),
    // 'forward' = native→target, 'reverse' = target→native.
    direction: cardDirectionSideEnum('direction').notNull(),
    // FSRS state fields (ts-fsrs Card shape).
    stability: real('stability'),
    difficulty: real('difficulty'),
    elapsedDays: integer('elapsed_days').notNull().default(0),
    scheduledDays: integer('scheduled_days').notNull().default(0),
    reps: integer('reps').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    // FSRS card state: 'New', 'Learning', 'Review', 'Relearning'.
    state: varchar('state', { length: 20 }).notNull().default('New'),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull().defaultNow(),
    lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('card_reviews_deck_vocab_direction_unique').on(
      t.deckId,
      t.vocabItemId,
      t.direction,
    ),
    index('card_reviews_deck_due_idx').on(t.deckId, t.dueAt),
  ],
);

// One row per completed study session — powers the deck list stats.
export const studySessions = pgTable(
  'study_sessions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    deckId: uuid('deck_id')
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    againCount: integer('again_count').notNull().default(0),
    hardCount: integer('hard_count').notNull().default(0),
    goodCount: integer('good_count').notNull().default(0),
    easyCount: integer('easy_count').notNull().default(0),
    cardsReviewed: integer('cards_reviewed').notNull().default(0),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('study_sessions_deck_idx').on(t.deckId, t.completedAt)],
);

// =============================================================================
// avatar_sessions (Kruu Bingo practice sessions — Feature C)
// =============================================================================

export const avatarSessions = pgTable('avatar_sessions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  deckId: uuid('deck_id')
    .notNull()
    .references(() => decks.id, { onDelete: 'cascade' }),
  // Duration in seconds.
  durationSeconds: integer('duration_seconds').notNull().default(0),
  // Cost in USD (also logged to ai_spend_log for cap tracking).
  costUsd: numeric('cost_usd', { precision: 10, scale: 6 }).notNull().default('0'),
  // Number of user turns in the conversation.
  turnCount: integer('turn_count').notNull().default(0),
  completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
});

// =============================================================================
// app_settings (global, superuser-controlled — singleton row id=1)
// =============================================================================

export const appSettings = pgTable('app_settings', {
  // Enforce a single row via id=1 (seeded in migration + read path).
  id: integer('id').primaryKey().default(1),
  // Inactivity timeout for avatar sessions, in seconds. Default 120s (2 min).
  // Configurable in 30s increments by superuser (30–1800s).
  avatarInactivityTimeoutSeconds: integer('avatar_inactivity_timeout_seconds')
    .notNull()
    .default(120),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// =============================================================================
// types
// =============================================================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserSettings = typeof userSettings.$inferSelect;
export type NewUserSettings = typeof userSettings.$inferInsert;
export type Lesson = typeof lessons.$inferSelect;
export type NewLesson = typeof lessons.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type VocabItem = typeof vocabItems.$inferSelect;
export type NewVocabItem = typeof vocabItems.$inferInsert;
export type VocabItemGloss = typeof vocabItemGlosses.$inferSelect;
export type NewVocabItemGloss = typeof vocabItemGlosses.$inferInsert;
export type LessonFile = typeof lessonFiles.$inferSelect;
export type NewLessonFile = typeof lessonFiles.$inferInsert;
export type LessonLink = typeof lessonLinks.$inferSelect;
export type NewLessonLink = typeof lessonLinks.$inferInsert;
export type AiSpendLog = typeof aiSpendLog.$inferSelect;
export type NewAiSpendLog = typeof aiSpendLog.$inferInsert;
export type AvatarSession = typeof avatarSessions.$inferSelect;
export type NewAvatarSession = typeof avatarSessions.$inferInsert;
export type ImageGenerationBatch = typeof imageGenerationBatches.$inferSelect;
export type NewImageGenerationBatch = typeof imageGenerationBatches.$inferInsert;
export type Deck = typeof decks.$inferSelect;
export type NewDeck = typeof decks.$inferInsert;
export type DeckItem = typeof deckItems.$inferSelect;
export type NewDeckItem = typeof deckItems.$inferInsert;
export type CardReview = typeof cardReviews.$inferSelect;
export type NewCardReview = typeof cardReviews.$inferInsert;
export type StudySession = typeof studySessions.$inferSelect;
export type NewStudySession = typeof studySessions.$inferInsert;
export type AppSettings = typeof appSettings.$inferSelect;
export type NewAppSettings = typeof appSettings.$inferInsert;
