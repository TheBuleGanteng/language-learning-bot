// Helpers for tag/lesson normalization shared between CSV import and the UI.

const LESSON_TAG_RE = /^lesson_(\d+)$/i;

export function isLessonTag(tag: string): boolean {
  return LESSON_TAG_RE.test(tag.trim());
}

/**
 * Parse a numeric lesson index out of a lesson name like "Lesson 3", "Lesson 34",
 * or "L3". Returns null if no integer index is detectable, e.g. "Final exam".
 */
export function parseLessonNameNumber(name: string): number | null {
  const m = name.match(/(?:lesson|l)\s*(\d+)/i);
  if (!m) return null;
  const n = parseInt(m[1]!, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * The Notion "Lessons" column embeds a Notion URL in parentheses after the
 * lesson name, like: `Lesson 3 (https://www.notion.so/.../abc123)`.
 * Strip the parenthesized URL and return just the human name.
 */
export function stripNotionLessonUrl(raw: string): string {
  return raw.replace(/\s*\(https?:\/\/[^)]+\)\s*$/i, '').trim();
}
