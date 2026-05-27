import { describe, it, expect } from 'vitest';
import { buildOrderBy, SORT_COLUMNS } from '@/lib/vocab';

// Drizzle's SQL templates are circular (column ↔ table), so we can't
// JSON.stringify them. Instead, extract just the raw string chunks
// (`queryChunks` from the SQL helper) for inspection.
function chunkString(sqlObj: unknown): string {
  if (sqlObj == null) return '';
  if (typeof sqlObj === 'string') return sqlObj;
  if (typeof sqlObj !== 'object') return '';
  const obj = sqlObj as Record<string, unknown>;
  // Drizzle StringChunk stores its literal in `value: string[]`
  if (Array.isArray(obj.value)) return (obj.value as string[]).join('');
  if (typeof obj.value === 'string') return obj.value;
  // SQL templates store their pieces in queryChunks
  if (Array.isArray(obj.queryChunks)) {
    return obj.queryChunks.map(chunkString).join('');
  }
  // Column refs — surface the column name so it isn't blank
  if (typeof obj.name === 'string') return String(obj.name);
  return '';
}

describe('buildOrderBy', () => {
  it('returns null for unknown / missing sort param', () => {
    expect(buildOrderBy(null, null)).toBeNull();
    expect(buildOrderBy('', null)).toBeNull();
    expect(buildOrderBy('nonsense', 'asc')).toBeNull();
  });

  it('returns a SQL expression for each valid sort column', () => {
    for (const col of SORT_COLUMNS) {
      const expr = buildOrderBy(col, 'asc');
      expect(expr).not.toBeNull();
    }
  });

  it('defaults to ASC when order is missing or unrecognized', () => {
    const asc1 = chunkString(buildOrderBy('thai', null));
    const asc2 = chunkString(buildOrderBy('thai', 'wrong'));
    const desc = chunkString(buildOrderBy('thai', 'desc'));
    expect(asc1).toEqual(asc2);
    expect(asc1).not.toEqual(desc);
    expect(asc1).toContain('ASC');
    expect(desc).toContain('DESC');
  });

  it('lessons / tags sorts use a MIN-subquery', () => {
    const lessons = chunkString(buildOrderBy('lessons', 'asc'));
    const tags = chunkString(buildOrderBy('tags', 'asc'));
    expect(lessons).toMatch(/MIN\(l\.name\)/);
    expect(tags).toMatch(/MIN\(t\.name\)/);
    // NULLS LAST keeps items with no association at the bottom regardless of direction
    expect(lessons).toMatch(/NULLS LAST/);
    expect(tags).toMatch(/NULLS LAST/);
  });
});
