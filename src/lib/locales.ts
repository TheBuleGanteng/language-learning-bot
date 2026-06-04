// Base-language / UI-locale catalog (PART B). The app's "base language" is the
// user's own language: it drives the UI locale (next-intl), the captions "base"
// translation target, and the per-base-language vocab glosses (PART C).
//
// NOTE: the value is persisted on the existing `users.native_language` column
// (Drizzle field `nativeLanguage`) — there is no separate `base_language`
// column. The locale set below redefines that column's allowed values.

export const LOCALES = ['en-US', 'zh-CN', 'zh-TW', 'ko', 'id'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en-US';

// Cookie used pre-auth (sign-up/login) and to mirror the choice client-side.
export const LOCALE_COOKIE = 'NEXT_LOCALE';

export interface LocaleInfo {
  code: Locale;
  /** English name, e.g. "Chinese (Simplified)". */
  englishName: string;
  /** Endonym, e.g. "简体中文". */
  nativeName: string;
  /** The word "Language" in that locale (for the selector trigger label). */
  languageWord: string;
  /** ISO 3166-1 alpha-2 flag country, or null (zh-TW renders no flag). */
  flagCountry: string | null;
}

export const LOCALE_CATALOG: Record<Locale, LocaleInfo> = {
  'en-US': {
    code: 'en-US',
    englishName: 'English (US)',
    nativeName: 'English',
    languageWord: 'Language',
    flagCountry: 'US',
  },
  'zh-CN': {
    code: 'zh-CN',
    englishName: 'Chinese (Simplified)',
    nativeName: '简体中文',
    languageWord: '语言',
    flagCountry: 'CN',
  },
  'zh-TW': {
    code: 'zh-TW',
    englishName: 'Chinese (Traditional)',
    nativeName: '繁體中文',
    languageWord: '語言',
    flagCountry: null,
  },
  ko: {
    code: 'ko',
    englishName: 'Korean',
    nativeName: '한국어',
    languageWord: '언어',
    flagCountry: 'KR',
  },
  id: {
    code: 'id',
    englishName: 'Bahasa Indonesia',
    nativeName: 'Bahasa Indonesia',
    languageWord: 'Bahasa',
    flagCountry: 'ID',
  },
};

export const LOCALE_LIST: ReadonlyArray<LocaleInfo> = LOCALES.map((c) => LOCALE_CATALOG[c]);

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}

export function defaultLocale(): Locale {
  return DEFAULT_LOCALE;
}

const LEGACY_LOCALE_MAP: Record<string, Locale> = {
  en: 'en-US',
  'en-us': 'en-US',
  english: 'en-US',
  zh: 'zh-CN',
  'zh-cn': 'zh-CN',
  'zh-hans': 'zh-CN',
  chinese: 'zh-CN',
  'zh-tw': 'zh-TW',
  'zh-hant': 'zh-TW',
  ko: 'ko',
  'ko-kr': 'ko',
  korean: 'ko',
  id: 'id',
  'id-id': 'id',
  indonesian: 'id',
  bahasa: 'id',
};

/** Coerce any stored/legacy value to one of the 5 locales (default en-US). */
export function normalizeLocale(value: string | null | undefined): Locale {
  if (!value) return DEFAULT_LOCALE;
  if (isLocale(value)) return value;
  const v = value.toLowerCase().replace('_', '-');
  if (isLocale(v as Locale)) return v as Locale;
  return LEGACY_LOCALE_MAP[v] ?? DEFAULT_LOCALE;
}

/** Google Cloud Translation language code for a locale (captions/glosses). */
export function localeToTranslateCode(locale: string | null | undefined): string {
  switch (normalizeLocale(locale)) {
    case 'zh-CN':
      return 'zh-CN';
    case 'zh-TW':
      return 'zh-TW';
    case 'ko':
      return 'ko';
    case 'id':
      return 'id';
    case 'en-US':
    default:
      return 'en';
  }
}

/** English name of a locale (e.g. for AI prompts that name the base language). */
export function localeEnglishName(locale: string | null | undefined): string {
  return LOCALE_CATALOG[normalizeLocale(locale)].englishName;
}

/** Endonym of a locale. */
export function localeNativeName(locale: string | null | undefined): string {
  return LOCALE_CATALOG[normalizeLocale(locale)].nativeName;
}
