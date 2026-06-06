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

/** The exportable CSV columns, in fixed output order. */
export type VocabCsvField = 'targetText' | 'nativeText' | 'tags' | 'lessons' | 'imageUrl';

/**
 * Column definitions in output order: the field key, its CSV header, and how to
 * render a row's value for that column. Drives both the field-picker popup
 * (item 2) and {@link buildVocabCsv}, so the two never drift apart.
 */
export const VOCAB_CSV_FIELDS: {
  key: VocabCsvField;
  header: string;
  value: (r: VocabCsvRow) => string;
}[] = [
  { key: 'targetText', header: 'Thai', value: (r) => r.targetText },
  { key: 'nativeText', header: 'English', value: (r) => r.nativeText },
  { key: 'tags', header: 'Tags', value: (r) => r.tags.join(', ') },
  { key: 'lessons', header: 'Lessons', value: (r) => r.lessons.join(', ') },
  { key: 'imageUrl', header: 'Image URL', value: (r) => r.imageUrl ?? '' },
];

/**
 * Serialize rows to CSV. When `fields` is given, only those columns are
 * emitted (in the canonical {@link VOCAB_CSV_FIELDS} order, regardless of the
 * order they were ticked); omitting it exports all five. Papa.unparse handles
 * all quoting/escaping (commas, quotes, newlines).
 */
export function buildVocabCsv(rows: VocabCsvRow[], fields?: VocabCsvField[]): string {
  const cols =
    fields && fields.length > 0
      ? VOCAB_CSV_FIELDS.filter((c) => fields.includes(c.key))
      : VOCAB_CSV_FIELDS;
  return Papa.unparse({
    fields: cols.map((c) => c.header),
    data: rows.map((r) => cols.map((c) => c.value(r))),
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
