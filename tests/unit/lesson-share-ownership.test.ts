import { describe, it, expect } from 'vitest';
import { splitOwnership } from '@/lib/lesson-share';

// Creator-gating for the bulk lesson endpoints (share + delete, Part 5): only
// owned ids are acted on; the rest are skipped + counted.
describe('splitOwnership', () => {
  it('acts on owned ids, skips + counts the rest', () => {
    const { updatedIds, skippedIds } = splitOwnership(
      ['a', 'b', 'c', 'd'],
      ['a', 'c'],
    );
    expect(updatedIds).toEqual(['a', 'c']);
    expect(skippedIds).toEqual(['b', 'd']);
  });

  it('dedupes requested ids', () => {
    const { updatedIds, skippedIds } = splitOwnership(['a', 'a', 'b'], ['a']);
    expect(updatedIds).toEqual(['a']);
    expect(skippedIds).toEqual(['b']);
  });

  it('all owned → nothing skipped', () => {
    const { updatedIds, skippedIds } = splitOwnership(['a', 'b'], ['a', 'b']);
    expect(updatedIds).toEqual(['a', 'b']);
    expect(skippedIds).toEqual([]);
  });

  it('none owned → everything skipped', () => {
    const { updatedIds, skippedIds } = splitOwnership(['a', 'b'], []);
    expect(updatedIds).toEqual([]);
    expect(skippedIds).toEqual(['a', 'b']);
  });
});
