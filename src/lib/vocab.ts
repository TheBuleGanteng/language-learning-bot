import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { lessons, tags, vocabItems } from '@/db/schema';

export const SORT_COLUMNS = ['thai', 'english', 'lessons', 'tags'] as const;
export type SortColumn = (typeof SORT_COLUMNS)[number];

/**
 * Lowest-priority tiebreaker appended to EVERY computed vocab sort (default and
 * explicit column sorts): items WITHOUT the `phrases` tag (flag 0) sort before
 * items WITH it (flag 1). Matched case-insensitively by tag name, since tags
 * merge case-insensitively in this app. Suppressed when manual drag order is
 * active (positions are absolute there).
 */
export const phrasesTiebreakerSql: SQL = sql`(CASE WHEN EXISTS (
  SELECT 1 FROM vocab_tags vt JOIN tags t ON t.id = vt.tag_id
  WHERE vt.vocab_item_id = ${vocabItems.id} AND lower(t.name) = 'phrases'
) THEN 1 ELSE 0 END) ASC`;

/**
 * Default vocab ordering — applied when there is NO active manual drag order and
 * NO explicit column sort (and no search relevance). Highest priority first:
 *   1. By the item's HIGHEST-numbered lesson, descending (Z→A natural-numeric);
 *      items with no lesson sort last (NULLS LAST).
 *   2. Phrases tiebreaker — within the same lesson group, items WITHOUT the
 *      `phrases` tag come before those with it (case-insensitive).
 *   3. Target column A→Z via the accent-agnostic normalized column.
 *   4. `created_at DESC` as a final stable tiebreaker.
 * Lesson number is the app's natural-numeric key ("Lesson 38" > "Lesson 9").
 */
export const defaultVocabSortSql: SQL = sql`(
  SELECT MAX(l.lesson_number) FROM vocab_lessons vl JOIN lessons l ON l.id = vl.lesson_id
  WHERE vl.vocab_item_id = ${vocabItems.id}
) DESC NULLS LAST, ${phrasesTiebreakerSql}, ${vocabItems.targetTextNormalized} ASC, ${vocabItems.createdAt} DESC`;

/**
 * ORDER BY expression for manual drag mode: the current user's `position`
 * (missing ⇒ +infinity ⇒ sorts last), then `created_at DESC` as the stable
 * tiebreaker among position-less (newly added) items.
 */
export function manualOrderSql(userId: string): SQL {
  return sql`COALESCE(
    (SELECT vo.position FROM vocab_order vo WHERE vo.user_id = ${userId} AND vo.vocab_item_id = ${vocabItems.id}),
    'infinity'::double precision
  ) ASC, ${vocabItems.createdAt} DESC`;
}

/**
 * Resolve sort/order query params into an ORDER BY expression for the
 * vocab list. Returns null when no explicit sort was requested — caller
 * falls back to `created_at DESC` (insertion order, newest first).
 */
export function buildOrderBy(
  sortParam: string | null,
  orderParam: string | null,
): SQL | null {
  if (!sortParam || !(SORT_COLUMNS as readonly string[]).includes(sortParam)) {
    return null;
  }
  const direction = orderParam === 'desc' ? 'desc' : 'asc';
  const dirSql = direction === 'desc' ? sql`DESC` : sql`ASC`;

  switch (sortParam as SortColumn) {
    case 'thai':
      return sql`${vocabItems.targetText} ${dirSql} NULLS LAST`;
    case 'english':
      return sql`${vocabItems.nativeText} ${dirSql} NULLS LAST`;
    case 'lessons':
      // Correlated subquery: alphabetically-first associated lesson name.
      // NULLS LAST keeps items with no lesson at the bottom in either dir.
      return sql`(SELECT MIN(l.name) FROM vocab_lessons vl JOIN lessons l ON l.id = vl.lesson_id WHERE vl.vocab_item_id = ${vocabItems.id}) ${dirSql} NULLS LAST`;
    case 'tags':
      return sql`(SELECT MIN(t.name) FROM vocab_tags vt JOIN tags t ON t.id = vt.tag_id WHERE vt.vocab_item_id = ${vocabItems.id}) ${dirSql} NULLS LAST`;
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function findOrCreateLesson(
  tx: Tx,
  userId: string,
  name: string,
): Promise<string> {
  const trimmed = name.trim();
  const [existing] = await tx
    .select({ id: lessons.id })
    .from(lessons)
    .where(and(eq(lessons.userId, userId), eq(lessons.name, trimmed)))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await tx
    .insert(lessons)
    .values({ userId, createdBy: userId, name: trimmed })
    .returning({ id: lessons.id });
  return created.id;
}

export async function findOrCreateTags(
  tx: Tx,
  userId: string,
  names: string[],
): Promise<string[]> {
  const trimmed = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
  if (trimmed.length === 0) return [];
  const existing = await tx
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(and(eq(tags.userId, userId), inArray(tags.name, trimmed)));
  const existingMap = new Map(existing.map((t) => [t.name, t.id]));
  const missing = trimmed.filter((n) => !existingMap.has(n));
  if (missing.length > 0) {
    const created = await tx
      .insert(tags)
      .values(missing.map((name) => ({ userId, createdBy: userId, name })))
      .returning({ id: tags.id, name: tags.name });
    for (const t of created) existingMap.set(t.name, t.id);
  }
  return trimmed.map((n) => existingMap.get(n)!);
}
