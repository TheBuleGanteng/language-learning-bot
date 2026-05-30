import { sql, type SQL } from 'drizzle-orm';

// =============================================================================
// Visibility predicates (Feature A)
//
// These return raw SQL conditions to drop into a `.where(...)` whose FROM
// clause includes the corresponding (un-aliased) table. They encode the §3a
// rules:
//
//   vocab_item  visible if  created_by = me
//                           OR (shared AND creator studies my target language)
//   lesson      visible if  created_by = me
//                           OR (shared AND it contains ≥1 vocab item I can see)
//   tag         visible if  created_by = me OR shared
//
// vocab_items has no language column, so a shared item's language is taken from
// its creator's profile (each user studies a single target language). We
// compare against the viewer's own stored target_language to avoid any
// normalization mismatch between the session and the DB.
// =============================================================================

function vocabVisible(alias: string, viewerId: string): SQL {
  return sql`(
    ${sql.raw(alias)}.created_by = ${viewerId}
    OR (${sql.raw(alias)}.visibility = 'shared' AND EXISTS (
      SELECT 1 FROM users cu
      WHERE cu.id = ${sql.raw(alias)}.created_by
        AND cu.target_language = (SELECT target_language FROM users WHERE id = ${viewerId})
    ))
  )`;
}

/** vocab_items the viewer may see. Use on a query selecting FROM vocab_items. */
export function vocabVisibleSql(viewerId: string): SQL {
  return vocabVisible('vocab_items', viewerId);
}

/** lessons the viewer may see. Use on a query selecting FROM lessons. */
export function lessonVisibleSql(viewerId: string): SQL {
  return sql`(
    lessons.created_by = ${viewerId}
    OR (lessons.visibility = 'shared' AND EXISTS (
      SELECT 1 FROM vocab_lessons vl
      JOIN vocab_items vi ON vi.id = vl.vocab_item_id
      WHERE vl.lesson_id = lessons.id AND ${vocabVisible('vi', viewerId)}
    ))
  )`;
}

/** tags the viewer may see. Use on a query selecting FROM tags. */
export function tagVisibleSql(viewerId: string): SQL {
  return sql`(tags.created_by = ${viewerId} OR tags.visibility = 'shared')`;
}
