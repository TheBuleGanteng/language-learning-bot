import { describe, it, expect } from 'vitest';
import { isLessonTag, parseLessonNameNumber, stripNotionLessonUrl } from '@/lib/tags';

describe('isLessonTag', () => {
  it('matches lesson_N', () => {
    expect(isLessonTag('lesson_1')).toBe(true);
    expect(isLessonTag('lesson_99')).toBe(true);
    expect(isLessonTag('LESSON_5')).toBe(true);
  });

  it('rejects non-lesson tags', () => {
    expect(isLessonTag('food')).toBe(false);
    expect(isLessonTag('lesson_summary')).toBe(false);
    expect(isLessonTag('lesson')).toBe(false);
    expect(isLessonTag('lesson_')).toBe(false);
    expect(isLessonTag('greetings')).toBe(false);
  });
});

describe('parseLessonNameNumber', () => {
  it('extracts an integer from "Lesson N"', () => {
    expect(parseLessonNameNumber('Lesson 3')).toBe(3);
    expect(parseLessonNameNumber('Lesson 34')).toBe(34);
    expect(parseLessonNameNumber('lesson 7')).toBe(7);
    expect(parseLessonNameNumber('L12')).toBe(12);
  });

  it('returns null for names without an integer index', () => {
    expect(parseLessonNameNumber('Final exam')).toBeNull();
    expect(parseLessonNameNumber('Review')).toBeNull();
    expect(parseLessonNameNumber('')).toBeNull();
  });
});

describe('stripNotionLessonUrl', () => {
  it('strips the trailing (https://...) URL added by Notion exports', () => {
    expect(stripNotionLessonUrl('Lesson 1 (https://www.notion.so/abc/foo-abc123)')).toBe(
      'Lesson 1',
    );
  });

  it('leaves clean lesson names alone', () => {
    expect(stripNotionLessonUrl('Lesson 1')).toBe('Lesson 1');
    expect(stripNotionLessonUrl('Final review')).toBe('Final review');
  });
});
