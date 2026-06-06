// Pure logic for the bulk Tags/Lessons editor (POST/PATCH /api/vocab/bulk).
// Kept side-effect-free so it is unit-testable without a database: the route
// handler does the DB I/O (auth, ownership lookups, join-table writes) and
// delegates the partition + delta computation here.

export interface BulkEditItemRow {
  id: string;
  /** The item's author. Only the author may edit it (mirrors the single-item PATCH). */
  createdBy: string | null;
}

export interface BulkEditPlanInput {
  /** The item ids the client asked to edit (may contain duplicates). */
  itemIds: string[];
  /** The items that actually exist and are visible to the user (id + createdBy). */
  items: BulkEditItemRow[];
  /** The current user id — editability is `createdBy === userId`. */
  userId: string;
  /** Tag ids to add — ALREADY validated to ones the user owns (see intersectIds). */
  tagAdd: string[];
  /** Tag ids to remove (no ownership filter needed — removing an association from your own item). */
  tagRemove: string[];
  /** Lesson ids to add — ALREADY validated to ones the user owns. */
  lessonAdd: string[];
  /** Lesson ids to remove. */
  lessonRemove: string[];
}

export interface BulkEditPlan {
  /** Distinct ids that pass the ownership check and will be mutated. */
  editableIds: string[];
  /** Distinct requested ids that are NOT editable (missing, not visible, or not the user's). */
  skippedIds: string[];
  /** Count of editable items — an editable item counts as updated even if its deltas net to no-op. */
  updated: number;
  /** Count of skipped ids. */
  skipped: number;
  /** vocab_tags rows to insert (idempotently). */
  tagInserts: { vocabItemId: string; tagId: string }[];
  /** vocab_lessons rows to insert (idempotently). */
  lessonInserts: { vocabItemId: string; lessonId: string }[];
}

/** Return only the `requested` ids that are present in `allowed` (set intersection,
 *  order following `requested`, de-duplicated). Used to defensively reject any
 *  tag/lesson id the user does not own before it reaches the join tables. */
export function intersectIds(requested: string[], allowed: Iterable<string>): string[] {
  const allow = allowed instanceof Set ? allowed : new Set(allowed);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of requested) {
    if (allow.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/**
 * Partition the requested items into editable vs skipped (by the
 * `createdBy === userId` rule) and compute the join-row inserts to apply. The
 * caller deletes `(editableIds × tagRemove)` / `(editableIds × lessonRemove)`
 * join rows directly — removals need no per-id materialization here.
 */
export function planBulkEdit(input: BulkEditPlanInput): BulkEditPlan {
  const { itemIds, items, userId, tagAdd, lessonAdd } = input;

  const editableSet = new Set(
    items.filter((i) => i.createdBy === userId).map((i) => i.id),
  );

  const editableIds: string[] = [];
  const skippedIds: string[] = [];
  const seen = new Set<string>();
  for (const id of itemIds) {
    if (seen.has(id)) continue; // de-dupe requested ids
    seen.add(id);
    if (editableSet.has(id)) editableIds.push(id);
    else skippedIds.push(id);
  }

  const tagInserts: { vocabItemId: string; tagId: string }[] = [];
  const lessonInserts: { vocabItemId: string; lessonId: string }[] = [];
  for (const vocabItemId of editableIds) {
    for (const tagId of tagAdd) tagInserts.push({ vocabItemId, tagId });
    for (const lessonId of lessonAdd) lessonInserts.push({ vocabItemId, lessonId });
  }

  return {
    editableIds,
    skippedIds,
    updated: editableIds.length,
    skipped: skippedIds.length,
    tagInserts,
    lessonInserts,
  };
}
