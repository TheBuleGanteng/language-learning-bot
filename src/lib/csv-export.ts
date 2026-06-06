import Papa from 'papaparse';

// Client-side CSV export of selected vocab (item 9). Built in the browser as a
// Blob download — no server round-trip, so there is no base-path concern.

export interface VocabCsvRow {
  /** Target-language text (Thai). */
  targetText: string;
  /** Native-language meaning (English). */
  nativeText: string;
  tags: string[];
  lessons: string[];
  /** Public image URL, or null/blank when none. */
  imageUrl: string | null;
}

/**
 * Serialize rows to CSV with the five export columns. Papa.unparse handles all
 * quoting/escaping (commas, quotes, newlines).
 */
export function buildVocabCsv(rows: VocabCsvRow[]): string {
  return Papa.unparse({
    fields: ['Thai', 'English', 'Tags', 'Lessons', 'Image URL'],
    data: rows.map((r) => [
      r.targetText,
      r.nativeText,
      r.tags.join(', '),
      r.lessons.join(', '),
      r.imageUrl ?? '',
    ]),
  });
}

/** Trigger a client-side download of `csv` as `filename`. */
export function downloadCsv(filename: string, csv: string): void {
  // Prepend a UTF-8 BOM so Excel reads Thai correctly.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** `vocab-export-YYYY-MM-DD.csv` from a Date (defaults to now). */
export function vocabCsvFilename(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `vocab-export-${y}-${m}-${d}.csv`;
}
