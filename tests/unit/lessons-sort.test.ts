import { describe, it, expect } from 'vitest';
import { sortLessons, type SortableLesson } from '@/lib/lessons-sort';

const L = (name: string, extra: Partial<SortableLesson> = {}): SortableLesson => ({
  name,
  topic: null,
  date: null,
  vocabCount: 0,
  ...extra,
});

describe('sortLessons — natural name sort', () => {
  const rows = [L('Lesson 10'), L('Lesson 2'), L('Lesson 1'), L('Lesson 21')];

  it('ascending: Lesson 2 before Lesson 10 (numeric-aware, not lexicographic)', () => {
    const names = sortLessons(rows, 'name', 'asc').map((r) => r.name);
    expect(names).toEqual(['Lesson 1', 'Lesson 2', 'Lesson 10', 'Lesson 21']);
  });

  it('descending reverses the natural order', () => {
    const names = sortLessons(rows, 'name', 'desc').map((r) => r.name);
    expect(names).toEqual(['Lesson 21', 'Lesson 10', 'Lesson 2', 'Lesson 1']);
  });

  it('is case-insensitive', () => {
    const names = sortLessons([L('beta'), L('Alpha'), L('alpha2')], 'name', 'asc').map(
      (r) => r.name,
    );
    expect(names).toEqual(['Alpha', 'alpha2', 'beta']);
  });

  it('does not mutate the input array', () => {
    const input = [L('Lesson 3'), L('Lesson 1')];
    const copy = [...input];
    sortLessons(input, 'name', 'asc');
    expect(input).toEqual(copy);
  });
});

describe('sortLessons — other columns', () => {
  it('vocab_count ascending then descending', () => {
    const rows = [L('a', { vocabCount: 5 }), L('b', { vocabCount: 1 }), L('c', { vocabCount: 9 })];
    expect(sortLessons(rows, 'vocab_count', 'asc').map((r) => r.vocabCount)).toEqual([1, 5, 9]);
    expect(sortLessons(rows, 'vocab_count', 'desc').map((r) => r.vocabCount)).toEqual([9, 5, 1]);
  });

  it('date sorts chronologically with nulls last (ascending)', () => {
    const rows = [L('a', { date: '2026-01-10' }), L('b', { date: null }), L('c', { date: '2026-01-02' })];
    expect(sortLessons(rows, 'date', 'asc').map((r) => r.name)).toEqual(['c', 'a', 'b']);
  });
});
