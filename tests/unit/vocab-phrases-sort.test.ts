import { describe, it, expect } from 'vitest';
import { phrasesTiebreakerSql, manualOrderSql, defaultVocabSortSql } from '@/lib/vocab';

// Drizzle SQL templates are circular; extract just the literal string chunks.
function chunkString(sqlObj: unknown): string {
  if (sqlObj == null) return '';
  if (typeof sqlObj === 'string') return sqlObj;
  if (typeof sqlObj !== 'object') return '';
  const obj = sqlObj as Record<string, unknown>;
  if (Array.isArray(obj.value)) return (obj.value as string[]).join('');
  if (typeof obj.value === 'string') return obj.value;
  if (Array.isArray(obj.queryChunks)) return obj.queryChunks.map(chunkString).join('');
  if (typeof obj.name === 'string') return String(obj.name);
  return '';
}

describe('phrasesTiebreakerSql', () => {
  const s = chunkString(phrasesTiebreakerSql);

  it('matches the phrases tag case-insensitively via the vocab_tags→tags join', () => {
    expect(s).toMatch(/vocab_tags/);
    expect(s).toMatch(/lower\(t\.name\) = 'phrases'/);
  });

  it('non-phrases (0) sort before phrases (1), ascending', () => {
    expect(s).toMatch(/THEN 1 ELSE 0/);
    expect(s).toMatch(/ASC/);
  });
});

describe('defaultVocabSortSql — 3-key default ordering', () => {
  const s = chunkString(defaultVocabSortSql);

  it('key 1: highest-numbered lesson, descending, no-lesson items last', () => {
    expect(s).toMatch(/MAX\(l\.lesson_number\)/);
    expect(s).toMatch(/DESC NULLS LAST/);
  });

  it('key 2: phrases-absent before phrases-present (case-insensitive)', () => {
    expect(s).toMatch(/lower\(t\.name\) = 'phrases'/);
    expect(s).toMatch(/THEN 1 ELSE 0/);
  });

  it('key 3: target column A→Z via the normalized (accent-agnostic) column', () => {
    expect(s).toMatch(/target_text_normalized/);
  });

  it('keys are applied in priority order: lesson → phrases → target', () => {
    const lessonIdx = s.indexOf('MAX(l.lesson_number)');
    const phrasesIdx = s.indexOf("lower(t.name) = 'phrases'");
    const targetIdx = s.indexOf('target_text_normalized');
    expect(lessonIdx).toBeGreaterThanOrEqual(0);
    expect(lessonIdx).toBeLessThan(phrasesIdx);
    expect(phrasesIdx).toBeLessThan(targetIdx);
  });

  it('has a final stable tiebreaker on created_at', () => {
    expect(s).toMatch(/created_at/);
  });
});

describe('manualOrderSql — suppresses the phrases tiebreaker', () => {
  const s = chunkString(manualOrderSql('user-123'));

  it('orders by the manual position with missing rows last (infinity)', () => {
    expect(s).toMatch(/vocab_order/);
    expect(s).toMatch(/infinity/);
    expect(s).toMatch(/ASC/);
  });

  it('does NOT include the phrases tiebreaker (positions are absolute)', () => {
    expect(s).not.toMatch(/phrases/);
  });
});
