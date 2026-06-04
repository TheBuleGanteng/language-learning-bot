export type LanguageCode = 'th' | 'en' | 'zh' | 'ja' | 'es' | 'fr' | 'de';

// Writing system. Anything other than 'latin' is considered non-roman, which is
// what gates the "romanized" caption option.
export type LanguageScript = 'latin' | 'thai' | 'han' | 'japanese';

export interface LanguageInfo {
  code: LanguageCode;
  name: string;
  nativeName: string;
  script: LanguageScript;
  rtl?: boolean;
}

export const LANGUAGES: ReadonlyArray<LanguageInfo> = [
  { code: 'th', name: 'Thai', nativeName: 'ไทย', script: 'thai' },
  { code: 'en', name: 'English', nativeName: 'English', script: 'latin' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', script: 'han' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', script: 'japanese' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', script: 'latin' },
  { code: 'fr', name: 'French', nativeName: 'Français', script: 'latin' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', script: 'latin' },
];

// V1: only Thai is unlocked as a target language.
export const UNLOCKED_TARGET_LANGUAGES: ReadonlyArray<LanguageCode> = ['th'];

const LEGACY_MAP: Record<string, LanguageCode> = {
  thai: 'th',
  english: 'en',
  chinese: 'zh',
  japanese: 'ja',
  spanish: 'es',
  french: 'fr',
  german: 'de',
};

/** Normalize a code that may still be a legacy long-form ("thai") to a 2-letter code. */
export function normalizeLanguageCode(value: string | null | undefined): LanguageCode {
  if (!value) return 'th';
  const lower = value.toLowerCase();
  if (LANGUAGES.some((l) => l.code === lower)) return lower as LanguageCode;
  if (lower in LEGACY_MAP) return LEGACY_MAP[lower];
  return 'th';
}

export function isLanguageCode(value: string): value is LanguageCode {
  return LANGUAGES.some((l) => l.code === value);
}

export function languageName(code: string | null | undefined): string {
  if (!code) return '';
  const normalized = normalizeLanguageCode(code);
  return LANGUAGES.find((l) => l.code === normalized)?.name ?? code;
}

/** The writing system for a language code (defaults to 'latin' if unknown). */
export function languageScript(code: string | null | undefined): LanguageScript {
  if (!code) return 'latin';
  const normalized = normalizeLanguageCode(code);
  return LANGUAGES.find((l) => l.code === normalized)?.script ?? 'latin';
}

/**
 * True when the language's normal script is not Latin — i.e. a romanized
 * caption option is meaningful (Thai yes, Spanish no).
 */
export function isNonRomanScript(code: string | null | undefined): boolean {
  return languageScript(code) !== 'latin';
}

export function languageNativeName(code: string | null | undefined): string {
  if (!code) return '';
  const normalized = normalizeLanguageCode(code);
  return LANGUAGES.find((l) => l.code === normalized)?.nativeName ?? code;
}

/**
 * `"Thai - TH"` — for dropdown items and other picker-style affordances
 * where the user is selecting between languages. In flowing prose or
 * content-descriptive headers, use {@link languageName} instead.
 */
export function languageDisplayLabel(code: string | null | undefined): string {
  if (!code) return '';
  const normalized = normalizeLanguageCode(code);
  const lang = LANGUAGES.find((l) => l.code === normalized);
  if (!lang) return String(code).toUpperCase();
  return `${lang.name} - ${normalized.toUpperCase()}`;
}
