import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  LOCALES,
  LOCALE_CATALOG,
  DEFAULT_LOCALE,
  normalizeLocale,
  localeToTranslateCode,
  localeEnglishName,
} from '@/lib/locales';
import { languageName } from '@/lib/languages';

describe('locales — Japanese (ja) support', () => {
  it('ja is in the canonical locales list', () => {
    expect(LOCALES).toContain('ja');
  });

  it('default locale is unchanged (en-US)', () => {
    expect(DEFAULT_LOCALE).toBe('en-US');
  });

  it('ja has full catalog metadata (name + flag)', () => {
    expect(LOCALE_CATALOG.ja).toMatchObject({
      code: 'ja',
      englishName: 'Japanese',
      nativeName: '日本語',
      flagCountry: 'JP',
    });
  });

  it('normalizeLocale resolves ja and legacy aliases', () => {
    expect(normalizeLocale('ja')).toBe('ja');
    expect(normalizeLocale('ja-JP')).toBe('ja');
    expect(normalizeLocale('japanese')).toBe('ja');
    // Unknown still falls back to the default.
    expect(normalizeLocale('xx')).toBe('en-US');
  });

  it('Google Translate code for ja is "ja"', () => {
    expect(localeToTranslateCode('ja')).toBe('ja');
  });

  it('localeEnglishName(ja) is Japanese (used by the Kruu Bingo prompt)', () => {
    expect(localeEnglishName('ja')).toBe('Japanese');
  });

  it("languageName('ja') returns Japanese", () => {
    expect(languageName('ja')).toBe('Japanese');
  });
});

describe('message catalog key parity', () => {
  function keys(obj: Record<string, unknown>, prefix = ''): string[] {
    let out: string[] = [];
    for (const k of Object.keys(obj)) {
      const np = prefix ? `${prefix}.${k}` : k;
      out.push(np);
      const v = obj[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        out = out.concat(keys(v as Record<string, unknown>, np));
      }
    }
    return out;
  }
  function load(locale: string): Record<string, unknown> {
    return JSON.parse(
      readFileSync(path.resolve(process.cwd(), 'messages', `${locale}.json`), 'utf8'),
    );
  }

  const enKeys = keys(load('en-US')).sort();

  // Every locale catalog (including ja) must have EXACTLY the en-US keys — no
  // missing keys (English fallback leaking) and no extras.
  for (const locale of LOCALES) {
    it(`${locale} has exactly the en-US keys`, () => {
      const k = keys(load(locale)).sort();
      expect(k).toEqual(enKeys);
    });
  }
});
