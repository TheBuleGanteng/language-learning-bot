import { describe, it, expect } from 'vitest';
import { selectAllState, toggleSelectAll } from '@/lib/selection';

describe('selectAllState', () => {
  it('empty list → neither all nor indeterminate', () => {
    expect(selectAllState([], new Set())).toEqual({ allSelected: false, indeterminate: false });
  });

  it('none of the listed selected → neither', () => {
    expect(selectAllState(['a', 'b', 'c'], new Set())).toEqual({
      allSelected: false,
      indeterminate: false,
    });
  });

  it('some-but-not-all selected → indeterminate', () => {
    expect(selectAllState(['a', 'b', 'c'], new Set(['b']))).toEqual({
      allSelected: false,
      indeterminate: true,
    });
  });

  it('all listed selected → allSelected (not indeterminate)', () => {
    expect(selectAllState(['a', 'b', 'c'], new Set(['a', 'b', 'c']))).toEqual({
      allSelected: true,
      indeterminate: false,
    });
  });

  it('only counts listed ids — extra selected ids outside the list are ignored', () => {
    expect(selectAllState(['a', 'b'], new Set(['a', 'b', 'z']))).toEqual({
      allSelected: true,
      indeterminate: false,
    });
  });
});

describe('toggleSelectAll', () => {
  it('from none selected → selects all listed', () => {
    expect([...toggleSelectAll(['a', 'b', 'c'], new Set())]).toEqual(['a', 'b', 'c']);
  });

  it('from partial → selects all listed', () => {
    expect([...toggleSelectAll(['a', 'b', 'c'], new Set(['b']))].sort()).toEqual(['a', 'b', 'c']);
  });

  it('from all selected → clears', () => {
    expect([...toggleSelectAll(['a', 'b', 'c'], new Set(['a', 'b', 'c']))]).toEqual([]);
  });
});
