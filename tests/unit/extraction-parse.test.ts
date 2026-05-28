import { describe, it, expect } from 'vitest';
import { parseExtractionResponse } from '@/lib/extraction/parse';

describe('parseExtractionResponse', () => {
  it('parses a well-formed response', () => {
    const raw = JSON.stringify({
      rows: [
        { targetText: 'sa-wàt-dii', nativeText: 'hello', confidence: 'high' },
        { targetText: 'khàwp-khun', nativeText: 'thank you', confidence: 'medium' },
      ],
    });
    const out = parseExtractionResponse(raw);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      targetText: 'sa-wàt-dii',
      nativeText: 'hello',
      confidence: 'high',
    });
    expect(out[1].confidence).toBe('medium');
  });

  it('handles empty rows array', () => {
    const out = parseExtractionResponse('{"rows":[]}');
    expect(out).toEqual([]);
  });

  it('defaults missing confidence to medium', () => {
    const raw = JSON.stringify({
      rows: [{ targetText: 'kin', nativeText: 'to eat' }],
    });
    const out = parseExtractionResponse(raw);
    expect(out[0].confidence).toBe('medium');
  });

  it('strips markdown code fences (```json …```)', () => {
    const wrapped =
      '```json\n{"rows":[{"targetText":"a","nativeText":"b","confidence":"high"}]}\n```';
    const out = parseExtractionResponse(wrapped);
    expect(out).toHaveLength(1);
    expect(out[0].targetText).toBe('a');
  });

  it('recovers when the model wraps JSON in commentary', () => {
    const wrapped =
      'Sure, here is the JSON:\n\n{"rows":[{"targetText":"x","nativeText":"y","confidence":"low"}]}\n\nLet me know if you need anything else.';
    const out = parseExtractionResponse(wrapped);
    expect(out).toHaveLength(1);
    expect(out[0].confidence).toBe('low');
  });

  it('ignores extra fields on each row', () => {
    const raw = JSON.stringify({
      rows: [
        {
          targetText: 'phǒm',
          nativeText: 'I (male)',
          confidence: 'high',
          partOfSpeech: 'pronoun',
        },
      ],
    });
    const out = parseExtractionResponse(raw);
    expect(out).toHaveLength(1);
    expect(out[0].targetText).toBe('phǒm');
  });

  it('trims whitespace on targetText and nativeText', () => {
    const raw = JSON.stringify({
      rows: [{ targetText: '  baan  ', nativeText: '  house  ', confidence: 'high' }],
    });
    const out = parseExtractionResponse(raw);
    expect(out[0].targetText).toBe('baan');
    expect(out[0].nativeText).toBe('house');
  });

  it('throws on missing rows field', () => {
    expect(() => parseExtractionResponse('{"items":[]}')).toThrow();
  });

  it('throws on malformed JSON', () => {
    expect(() => parseExtractionResponse('not json at all')).toThrow();
  });

  it('throws when a row is missing required text fields', () => {
    expect(() =>
      parseExtractionResponse('{"rows":[{"targetText":"","nativeText":"x"}]}'),
    ).toThrow();
  });
});
