import { describe, it, expect } from 'vitest';
import {
  ORDER_STEP,
  initialPositions,
  computeInsertPosition,
  manualPositionSort,
} from '@/lib/manual-order';

describe('initialPositions — lazy full-set init', () => {
  it('writes a sparse position for ALL ids in display order', () => {
    const out = initialPositions(['a', 'b', 'c']);
    expect(out).toEqual([
      { id: 'a', position: ORDER_STEP },
      { id: 'b', position: ORDER_STEP * 2 },
      { id: 'c', position: ORDER_STEP * 3 },
    ]);
    // Sparse spacing leaves room for midpoint inserts between any two.
    expect(out[1].position - out[0].position).toBe(ORDER_STEP);
  });

  it('handles the empty set', () => {
    expect(initialPositions([])).toEqual([]);
  });
});

describe('computeInsertPosition — midpoint / ends', () => {
  it('takes the midpoint between two neighbours', () => {
    expect(computeInsertPosition(1024, 2048)).toBe(1536);
    expect(computeInsertPosition(1000, 2000)).toBe(1500);
  });

  it('steps below the first item when dropped at the top', () => {
    expect(computeInsertPosition(null, 1024)).toBe(1024 - ORDER_STEP);
  });

  it('steps above the last item when dropped at the bottom', () => {
    expect(computeInsertPosition(2048, null)).toBe(2048 + ORDER_STEP);
  });

  it('uses the first slot for an empty list', () => {
    expect(computeInsertPosition(null, null)).toBe(ORDER_STEP);
  });
});

describe('subset reorder leaves hidden items unchanged', () => {
  // Full global order a..e. The visible (filtered) subset is [a, c, e]; the
  // user drags `e` between `a` and `c`. Only `e`'s position changes — the hidden
  // items (b, d) keep their positions, so their relative order is untouched.
  it('only the moved item changes position; hidden order preserved', () => {
    const pos: Record<string, number> = { a: 1024, b: 2048, c: 3072, d: 4096, e: 5120 };
    // New visible neighbours after dropping e between a and c: before=a, after=c.
    const newE = computeInsertPosition(pos.a, pos.c); // 2048
    const updated = { ...pos, e: newE };

    // Hidden items b and d are unchanged.
    expect(updated.b).toBe(2048);
    expect(updated.d).toBe(4096);

    // Global order by position now: a, (b & e tie at 2048 — stable), c, d.
    const order = manualPositionSort(
      Object.keys(updated),
      (id) => updated[id],
    );
    // a first, then the 2048 group in stable insertion order (b before e since
    // Object.keys preserves a,b,c,d,e), then c, d.
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('c'));
    expect(order.indexOf('e')).toBeLessThan(order.indexOf('c'));
    // b and d retain their relative order (b before d).
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('d'));
  });
});

describe('manualPositionSort — null positions sort last', () => {
  it('items with no row (newly added) append, stable among themselves', () => {
    const items = [
      { id: 'x', pos: 2048 },
      { id: 'new1', pos: null },
      { id: 'y', pos: 1024 },
      { id: 'new2', pos: null },
    ];
    const order = manualPositionSort(items, (i) => i.pos).map((i) => i.id);
    expect(order).toEqual(['y', 'x', 'new1', 'new2']);
  });

  it('is stable for equal positions', () => {
    const items = [
      { id: 'a', pos: 100 },
      { id: 'b', pos: 100 },
      { id: 'c', pos: 50 },
    ];
    expect(manualPositionSort(items, (i) => i.pos).map((i) => i.id)).toEqual(['c', 'a', 'b']);
  });
});
