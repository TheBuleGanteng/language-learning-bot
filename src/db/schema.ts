import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  real,
  date,
  primaryKey,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// =============================================================================
// users
// =============================================================================

export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  targetLanguage: text('target_language').notNull().default('thai'),
  nativeLanguage: text('native_language').notNull().default('english'),
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
    transliteration: text('transliteration'),
    pos: text('pos'),
    exampleTarget: text('example_target'),
    exampleNative: text('example_native'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('vocab_items_user_created_idx').on(t.userId, t.createdAt.desc())],
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
