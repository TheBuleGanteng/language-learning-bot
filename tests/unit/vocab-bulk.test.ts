import { describe, it, expect } from 'vitest';
import { planBulkEdit, intersectIds, type BulkEditItemRow } from '@/lib/vocab-bulk';

const ME = 'user-me';
const OTHER = 'user-other';

// Three items: two mine, one someone else's (shared, visible but not editable).
const ITEMS: BulkEditItemRow[] = [
  { id: 'v1', createdBy: ME },
  { id: 'v2', createdBy: ME },
  { id: 'v3', createdBy: OTHER },
];
const ALL_IDS = ['v1', 'v2', 'v3'];

describe('intersectIds', () => {
  it('keeps only ids present in the allowed set, de-duped, in requested order', () => {
    expect(intersectIds(['a', 'b', 'x', 'a'], ['a', 'b', 'c'])).toEqual(['a', 'b']);
  });
  it('rejects cross-language / unowned ids (not in allowed)', () => {
    // 't-foreign' belongs to another language/user → dropped.
    expect(intersectIds(['t-mine', 't-foreign'], new Set(['t-mine']))).toEqual(['t-mine']);
  });
  it('returns [] when nothing matches', () => {
    expect(intersectIds(['x', 'y'], ['a'])).toEqual([]);
  });
});

describe('planBulkEdit — add only', () => {
  it('inserts each (editable item × add id); no skips when all owned', () => {
    const plan = planBulkEdit({
      itemIds: ['v1', 'v2'],
      items: ITEMS,
      userId: ME,
      tagAdd: ['t1'],
      tagRemove: [],
      lessonAdd: ['l1', 'l2'],
      lessonRemove: [],
    });
    expect(plan.updated).toBe(2);
    expect(plan.skipped).toBe(0);
    expect(plan.skippedIds).toEqual([]);
    expect(plan.tagInserts).toEqual([
      { vocabItemId: 'v1', tagId: 't1' },
      { vocabItemId: 'v2', tagId: 't1' },
    ]);
    expect(plan.lessonInserts).toEqual([
      { vocabItemId: 'v1', lessonId: 'l1' },
      { vocabItemId: 'v1', lessonId: 'l2' },
      { vocabItemId: 'v2', lessonId: 'l1' },
      { vocabItemId: 'v2', lessonId: 'l2' },
    ]);
  });
});

describe('planBulkEdit — remove only', () => {
  it('produces no inserts; removals are applied by the caller over editableIds', () => {
    const plan = planBulkEdit({
      itemIds: ['v1', 'v2'],
      items: ITEMS,
      userId: ME,
      tagAdd: [],
      tagRemove: ['t1'],
      lessonAdd: [],
      lessonRemove: ['l1'],
    });
    expect(plan.tagInserts).toEqual([]);
    expect(plan.lessonInserts).toEqual([]);
    expect(plan.editableIds).toEqual(['v1', 'v2']);
    expect(plan.updated).toBe(2);
  });
});

describe('planBulkEdit — mixed add + remove', () => {
  it('inserts adds and reports editable ids for the removal scope', () => {
    const plan = planBulkEdit({
      itemIds: ['v1'],
      items: ITEMS,
      userId: ME,
      tagAdd: ['t2'],
      tagRemove: ['t1'],
      lessonAdd: ['l3'],
      lessonRemove: ['l1'],
    });
    expect(plan.tagInserts).toEqual([{ vocabItemId: 'v1', tagId: 't2' }]);
    expect(plan.lessonInserts).toEqual([{ vocabItemId: 'v1', lessonId: 'l3' }]);
    expect(plan.editableIds).toEqual(['v1']);
  });
});

describe('planBulkEdit — ownership skip', () => {
  it("skips items the user did not create and reports skippedIds + counts", () => {
    const plan = planBulkEdit({
      itemIds: ALL_IDS, // includes v3 (owned by OTHER)
      items: ITEMS,
      userId: ME,
      tagAdd: ['t1'],
      tagRemove: [],
      lessonAdd: [],
      lessonRemove: [],
    });
    expect(plan.editableIds).toEqual(['v1', 'v2']);
    expect(plan.skippedIds).toEqual(['v3']);
    expect(plan.updated).toBe(2);
    expect(plan.skipped).toBe(1);
    // v3 never receives an insert.
    expect(plan.tagInserts.some((r) => r.vocabItemId === 'v3')).toBe(false);
  });

  it('treats a non-existent / not-visible id as skipped', () => {
    const plan = planBulkEdit({
      itemIds: ['v1', 'ghost'],
      items: ITEMS, // 'ghost' absent from the loaded rows
      userId: ME,
      tagAdd: ['t1'],
      tagRemove: [],
      lessonAdd: [],
      lessonRemove: [],
    });
    expect(plan.editableIds).toEqual(['v1']);
    expect(plan.skippedIds).toEqual(['ghost']);
    expect(plan.skipped).toBe(1);
  });
});

describe('planBulkEdit — idempotent re-add', () => {
  it('is deterministic: re-running yields an identical insert set (DB ON CONFLICT makes it a no-op)', () => {
    const args = {
      itemIds: ['v1', 'v2'],
      items: ITEMS,
      userId: ME,
      tagAdd: ['t1'],
      tagRemove: [],
      lessonAdd: [] as string[],
      lessonRemove: [] as string[],
    };
    const a = planBulkEdit(args);
    const b = planBulkEdit(args);
    expect(b.tagInserts).toEqual(a.tagInserts);
    expect(b.updated).toBe(a.updated);
  });

  it('de-dupes repeated requested item ids so an item is updated once', () => {
    const plan = planBulkEdit({
      itemIds: ['v1', 'v1', 'v2'],
      items: ITEMS,
      userId: ME,
      tagAdd: ['t1'],
      tagRemove: [],
      lessonAdd: [],
      lessonRemove: [],
    });
    expect(plan.editableIds).toEqual(['v1', 'v2']);
    expect(plan.updated).toBe(2);
    expect(plan.tagInserts).toHaveLength(2);
  });
});

describe('planBulkEdit — cross-language id rejection (integration with intersectIds)', () => {
  it('only owned add-ids survive, so foreign ids never reach the inserts', () => {
    const ownedTagIds = new Set(['t-own']);
    const requested = ['t-own', 't-foreign'];
    const validated = intersectIds(requested, ownedTagIds);
    const plan = planBulkEdit({
      itemIds: ['v1'],
      items: ITEMS,
      userId: ME,
      tagAdd: validated,
      tagRemove: [],
      lessonAdd: [],
      lessonRemove: [],
    });
    expect(plan.tagInserts).toEqual([{ vocabItemId: 'v1', tagId: 't-own' }]);
  });
});
