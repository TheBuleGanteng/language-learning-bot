// Natural, locale-aware sorting for the lessons list. Pure + tested so the
// "Lesson 2 before Lesson 10" behavior is verifiable without the React tree.
import { stripHtml } from '@/lib/strip-html';

export type LessonSortCol = 'name' | 'topic' | 'date' | 'vocab_count';
export type SortOrder = 'asc' | 'desc';

export interface SortableLesson {
  name: string;
  topic: string | null;
  date: string | null;
  vocabCount: number;
}

/** Natural (numeric-aware), case-insensitive string compare: "Lesson 2" < "Lesson 10". */
function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function compareBy(a: SortableLesson, b: SortableLesson, col: LessonSortCol): number {
  switch (col) {
    case 'name':
      return naturalCompare(a.name, b.name);
    case 'topic':
      return naturalCompare(stripHtml(a.topic ?? ''), stripHtml(b.topic ?? ''));
    case 'date': {
      // Nulls last (in ascending); compare ISO date strings chronologically.
      const av = a.date ?? '';
      const bv = b.date ?? '';
      if (av === bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      return av < bv ? -1 : 1;
    }
    case 'vocab_count':
      return a.vocabCount - b.vocabCount;
  }
}

/**
 * Stable sort of lessons by a column, ascending or descending. Drives the list
 * purely from the displayed name (natural order), with NO visibility grouping —
 * fixing the prior behavior where visibility grouped the list and the header
 * sort never drove a name sort.
 */
export function sortLessons<T extends SortableLesson>(
  rows: T[],
  col: LessonSortCol,
  order: SortOrder,
): T[] {
  const dir = order === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => dir * compareBy(a, b, col));
}
