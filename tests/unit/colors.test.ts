import { describe, it, expect } from 'vitest';
import {
  colorForLesson,
  colorForTag,
  djb2Hash,
  LESSON_PALETTE,
  TAG_PALETTE,
} from '@/lib/colors';

describe('color palette', () => {
  it('returns the same color for the same input', () => {
    expect(colorForLesson('Lesson 5')).toEqual(colorForLesson('Lesson 5'));
    expect(colorForTag('food')).toEqual(colorForTag('food'));
  });

  it('returns different colors for different inputs (probabilistically)', () => {
    const colors = ['food', 'classifier', 'pronouns', 'questions', 'greetings'].map(colorForTag);
    const unique = new Set(colors.map((c) => c.bg));
    expect(unique.size).toBeGreaterThanOrEqual(3);
  });

  it('hash is deterministic', () => {
    expect(djb2Hash('test')).toEqual(djb2Hash('test'));
  });

  it('every palette entry has bg/text/ring strings', () => {
    for (const c of [...LESSON_PALETTE, ...TAG_PALETTE]) {
      expect(c.bg).toMatch(/^bg-/);
      expect(c.text).toMatch(/^text-/);
      expect(c.ring).toMatch(/^ring-/);
    }
  });
});
