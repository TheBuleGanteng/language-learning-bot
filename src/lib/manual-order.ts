// Pure helpers for per-user manual drag ordering (vocab_order / lesson_order).
//
// `position` is a fractional index (double precision). The relative order of a
// type is `position ASC`; an item with no row sorts LAST. A drag sets only the
// moved item's position to the midpoint of its new visible neighbours, so items
// hidden by a filter / lesson scope keep their positions — and thus their
// relative order — untouched. These functions are kept side-effect-free so the
// fractional-index maths is verifiable without a database.

/** Sparse spacing between initial positions, leaving room for midpoint inserts. */
export const ORDER_STEP = 1024;

/**
 * Materialize a full ordering for `ids` (already in the desired display order)
 * as sparse fractional indices: 1024, 2048, 3072, … This is what the server
 * writes on the FIRST drag, before applying the single move, so every item the
 * user can currently order gets a row.
 */
export function initialPositions(ids: string[]): { id: string; position: number }[] {
  return ids.map((id, idx) => ({ id, position: (idx + 1) * ORDER_STEP }));
}

/**
 * The new position for a dragged item given its new visible neighbours'
 * positions (the item now directly ABOVE it = `before`, the item directly BELOW
 * it = `after`). `null` means "no neighbour on that side" (dropped at an end).
 *
 *  - between two items → the midpoint
 *  - at the top    (before=null)         → one step below the first item
 *  - at the bottom (after=null)          → one step above the last item
 *  - empty list    (both null)           → the first slot
 */
export function computeInsertPosition(before: number | null, after: number | null): number {
  if (before != null && after != null) return (before + after) / 2;
  if (before == null && after != null) return after - ORDER_STEP;
  if (before != null && after == null) return before + ORDER_STEP;
  return ORDER_STEP;
}

/**
 * Stable sort of `items` by their manual position (ascending), with items whose
 * position is `null`/`undefined` (no row — e.g. added after manual mode began)
 * pushed to the end while keeping their incoming relative order. Mirrors the
 * server's `COALESCE(position, 'infinity') ASC` so client + server agree.
 */
export function manualPositionSort<T>(items: T[], posOf: (item: T) => number | null | undefined): T[] {
  return items
    .map((item, idx) => ({ item, idx, pos: posOf(item) }))
    .sort((a, b) => {
      const ap = a.pos ?? Infinity;
      const bp = b.pos ?? Infinity;
      if (ap !== bp) return ap - bp;
      return a.idx - b.idx; // stable for equal / both-missing positions
    })
    .map((w) => w.item);
}
