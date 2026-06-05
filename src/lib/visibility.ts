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

// lesson_files / lesson_links carry their own per-material `visibility` (granular
// lesson sharing). They have no language column, so a shared row's language is
// taken from its owner's (`user_id`) profile — the same rule vocab uses for its
// creator. A viewer sees their own rows plus shared rows whose owner studies the
// viewer's target language.
function materialVisible(table: string, alias: string, viewerId: string): SQL {
  return sql`(
    ${sql.raw(alias)}.user_id = ${viewerId}
    OR (${sql.raw(alias)}.visibility = 'shared' AND EXISTS (
      SELECT 1 FROM users cu
      WHERE cu.id = ${sql.raw(alias)}.user_id
        AND cu.target_language = (SELECT target_language FROM users WHERE id = ${viewerId})
    ))
  )`;
}

/** lesson_files the viewer may see. Use on a query selecting FROM lesson_files. */
export function lessonFileVisibleSql(viewerId: string): SQL {
  return materialVisible('lesson_files', 'lesson_files', viewerId);
}

/** lesson_links the viewer may see. Use on a query selecting FROM lesson_links. */
export function lessonLinkVisibleSql(viewerId: string): SQL {
  return materialVisible('lesson_links', 'lesson_links', viewerId);
}

/**
 * lessons the viewer may see. Use on a query selecting FROM lessons. A shared
 * lesson is visible if it contains ≥1 visible material of ANY category (vocab,
 * files, or links) — so a lesson shared with only notes/audio/links (and no
 * vocab) is still reachable.
 */
export function lessonVisibleSql(viewerId: string): SQL {
  return sql`(
    lessons.created_by = ${viewerId}
    OR (lessons.visibility = 'shared' AND (
      EXISTS (
        SELECT 1 FROM vocab_lessons vl
        JOIN vocab_items vi ON vi.id = vl.vocab_item_id
        WHERE vl.lesson_id = lessons.id AND ${vocabVisible('vi', viewerId)}
      )
      OR EXISTS (
        SELECT 1 FROM lesson_files lf
        WHERE lf.lesson_id = lessons.id AND ${materialVisible('lesson_files', 'lf', viewerId)}
      )
      OR EXISTS (
        SELECT 1 FROM lesson_links ll
        WHERE ll.lesson_id = lessons.id AND ${materialVisible('lesson_links', 'll', viewerId)}
      )
    ))
  )`;
}

/** tags the viewer may see. Use on a query selecting FROM tags. */
export function tagVisibleSql(viewerId: string): SQL {
  return sql`(tags.created_by = ${viewerId} OR tags.visibility = 'shared')`;
}
