import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { lessons, tags, vocabItems } from '@/db/schema';

export const SORT_COLUMNS = ['thai', 'english', 'lessons', 'tags'] as const;
export type SortColumn = (typeof SORT_COLUMNS)[number];

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
    .values({ userId, name: trimmed })
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
      .values(missing.map((name) => ({ userId, name })))
      .returning({ id: tags.id, name: tags.name });
    for (const t of created) existingMap.set(t.name, t.id);
  }
  return trimmed.map((n) => existingMap.get(n)!);
}
