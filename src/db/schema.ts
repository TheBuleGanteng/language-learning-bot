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

// =============================================================================
// users
// =============================================================================

export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  targetLanguage: text('target_language').notNull().default('th'),
  nativeLanguage: text('native_language').notNull().default('en'),
  // Role-based admin (Feature A). Display name is the public identity shown on
  // shared content; nullable until the user sets one, unique (case-insensitive
  // uniqueness is enforced in the API).
  role: userRoleEnum('role').notNull().default('regular'),
  displayName: varchar('display_name', { length: 50 }).unique(),
  // Bumped on password reset / "sign out everywhere". JWTs whose `iat` is
  // earlier than this timestamp are rejected in the auth callback. This is
  // how we invalidate sessions under a stateless JWT strategy.
  sessionsInvalidatedAt: timestamp('sessions_invalidated_at', { withTimezone: true }),
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
  imageProvider: text('image_provider').notNull().default('google'),
  imageModel: text('image_model').notNull().default('imagen-4-fast'),
  extractionProvider: text('extraction_provider').notNull().default('anthropic'),
  extractionModel: text('extraction_model').notNull().default('claude-opus-4-7'),
  imageSpendReminderUsd: numeric('image_spend_reminder_usd', { precision: 8, scale: 2 })
    .notNull()
    .default('25'),
  imageSpendHardStopUsd: numeric('image_spend_hard_stop_usd', { precision: 8, scale: 2 })
    .notNull()
    .default('100'),
  // Format: "{YYYY-MM}:{amount}". Null until the first reminder fires this
  // month. On read, if the YYYY-MM prefix doesn't match the current month,
  // treat the band as 0 — no separate "reset at month boundary" job needed.
  imageSpendLastReminderAt: text('image_spend_last_reminder_at'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('lesson_files_lesson_kind_idx').on(t.lessonId, t.kind),
    check('lesson_files_kind_check', sql`${t.kind} IN ('pdf', 'audio')`),
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
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('lesson_links_lesson_idx').on(t.lessonId),
    check('lesson_links_kind_check', sql`${t.kind} IN ('generic', 'youtube')`),
  ],
);

// =============================================================================
// image_generation_log (cost tracking)
// =============================================================================

export const imageGenerationLog = pgTable(
  'image_generation_log',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Nullable: vocab item may be deleted later but we keep the historical cost row.
    vocabItemId: uuid('vocab_item_id').references(() => vocabItems.id, {
      onDelete: 'set null',
    }),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    estimatedCostUsd: numeric('estimated_cost_usd', { precision: 10, scale: 6 }).notNull(),
    status: text('status').notNull(),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('img_gen_log_user_month_idx').on(t.userId, t.createdAt),
    check(
      'image_generation_log_status_check',
      sql`${t.status} IN ('success', 'failed', 'refused')`,
    ),
  ],
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
export type LessonFile = typeof lessonFiles.$inferSelect;
export type NewLessonFile = typeof lessonFiles.$inferInsert;
export type LessonLink = typeof lessonLinks.$inferSelect;
export type NewLessonLink = typeof lessonLinks.$inferInsert;
export type ImageGenerationLog = typeof imageGenerationLog.$inferSelect;
export type NewImageGenerationLog = typeof imageGenerationLog.$inferInsert;
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
