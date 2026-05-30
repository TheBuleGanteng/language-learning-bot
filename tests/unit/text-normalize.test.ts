import { describe, it, expect } from 'vitest';
import { normalizeText, escapeRegex } from '@/lib/text-normalize';

describe('normalizeText', () => {
  it('strips a háček (combining caron)', () => {
    expect(normalizeText('sǎai')).toBe('saai');
  });

  it('maps IPA ʉ → u and strips the combining circumflex', () => {
    // ʉ → u (Latin equivalent), then the combining circumflex is removed.
    expect(normalizeText('krʉ̂angbin')).toBe('kruangbin');
  });

  it('maps IPA ɛ/ɔ and strips the acute accent', () => {
    expect(normalizeText('lɛ́ɔ')).toBe('leo');
  });

  it('lowercases plain ASCII', () => {
    expect(normalizeText('Hello')).toBe('hello');
  });

  it('maps uppercase IPA too', () => {
    expect(normalizeText('BPLƐƐ')).toBe('bplee');
  });

  it('returns empty for empty input', () => {
    expect(normalizeText('')).toBe('');
  });

  it('is idempotent', () => {
    expect(normalizeText(normalizeText('sǎai'))).toBe(normalizeText('sǎai'));
  });
});

describe('escapeRegex', () => {
  it('escapes regex metacharacters', () => {
    expect(escapeRegex('a.b*c')).toBe('a\\.b\\*c');
    expect(escapeRegex('(x)')).toBe('\\(x\\)');
  });

  it('leaves plain text untouched', () => {
    expect(escapeRegex('saai')).toBe('saai');
  });
});
