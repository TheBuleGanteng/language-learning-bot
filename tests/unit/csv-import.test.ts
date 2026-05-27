import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseNotionCsv } from '@/lib/csv-import';

const fixturePath = path.resolve(__dirname, '../fixtures/sample-notion-export.csv');
const csv = readFileSync(fixturePath, 'utf8');

describe('parseNotionCsv (Notion export fixture)', () => {
  const { rows, skippedEmpty, skippedDuplicatesInFile, errors } = parseNotionCsv(csv);

  it('returns no parse errors', () => {
    expect(errors).toEqual([]);
  });

  it('skips the row with an empty Thai cell', () => {
    expect(skippedEmpty).toBe(1);
  });

  it('skips the duplicate (สวัสดี, Hello) row', () => {
    expect(skippedDuplicatesInFile).toBe(1);
  });

  it('produces the expected number of unique rows', () => {
    // 8 data rows - 1 dup - 1 empty = 6
    expect(rows).toHaveLength(6);
  });

  it('strips the Notion URL from lesson names', () => {
    const row = rows.find((r) => r.targetText === 'สวัสดี');
    expect(row?.lessonName).toBe('Lesson 1');
  });

  it('drops lesson_N tags from the Tags column', () => {
    const helloRow = rows.find((r) => r.targetText === 'สวัสดี');
    expect(helloRow?.tagNames).toEqual(['greetings']);
    const eatRow = rows.find((r) => r.targetText === 'กิน');
    expect(eatRow?.tagNames.sort()).toEqual(['food', 'verbs']);
  });

  it('keeps multi-word lesson names like "Final review"', () => {
    const row = rows.find((r) => r.targetText === 'หิว');
    expect(row?.lessonName).toBe('Final review');
    expect(row?.tagNames).toEqual([]);
  });

  it('treats empty Lessons cell as no lesson', () => {
    const row = rows.find((r) => r.targetText === 'ครับ');
    expect(row?.lessonName).toBeNull();
  });

  it('handles rows with no tags', () => {
    const row = rows.find((r) => r.targetText === 'น้ำ');
    expect(row?.tagNames).toEqual(['food']);
  });
});
