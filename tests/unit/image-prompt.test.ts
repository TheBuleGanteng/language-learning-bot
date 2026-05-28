import { describe, it, expect } from 'vitest';
import { buildImagePrompt } from '@/lib/image-gen/prompt';

describe('buildImagePrompt', () => {
  it('default prompt contains the no-text rule', () => {
    const out = buildImagePrompt({
      nativeText: 'to eat',
      targetLanguageName: 'Thai',
    });
    expect(out).toContain('NO text');
    expect(out).toContain('cartoon');
  });

  it('default prompt includes the native text and target language name', () => {
    const out = buildImagePrompt({
      nativeText: 'apple',
      targetLanguageName: 'Spanish',
    });
    expect(out).toContain('"apple"');
    expect(out).toContain('Spanish');
  });

  it('override wraps the user prompt with the no-text rule', () => {
    const out = buildImagePrompt({
      nativeText: 'unused',
      targetLanguageName: 'Thai',
      override: 'A blue elephant playing chess.',
    });
    expect(out.startsWith('A blue elephant playing chess.')).toBe(true);
    expect(out).toContain('NO text');
    // The default template's introduction should NOT appear when override is set
    expect(out).not.toContain('vocabulary word for a learner');
  });

  it('treats whitespace-only override as no override', () => {
    const out = buildImagePrompt({
      nativeText: 'hello',
      targetLanguageName: 'Thai',
      override: '   \n\t  ',
    });
    expect(out).toContain('"hello"');
    expect(out).toContain('vocabulary word for a learner');
  });

  it('handles special characters in native text without breaking the template', () => {
    const tricky = `She said "hi"; 50% off — get it now!`;
    const out = buildImagePrompt({
      nativeText: tricky,
      targetLanguageName: 'Thai',
    });
    expect(out).toContain(tricky);
    expect(out).toContain('NO text');
  });
});
