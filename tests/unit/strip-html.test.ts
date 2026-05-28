import { describe, it, expect } from 'vitest';
import { stripHtml } from '@/lib/strip-html';

describe('stripHtml', () => {
  it('returns empty for null/undefined/empty', () => {
    expect(stripHtml(null)).toBe('');
    expect(stripHtml(undefined)).toBe('');
    expect(stripHtml('')).toBe('');
  });

  it('strips all tags', () => {
    expect(stripHtml('<p>hello <strong>world</strong></p>')).toBe('hello world');
  });

  it('handles nested lists', () => {
    const out = stripHtml('<ul><li>one</li><li>two</li></ul>');
    expect(out).toContain('one');
    expect(out).toContain('two');
  });

  it('decodes the common entities Tiptap emits', () => {
    expect(stripHtml('a&nbsp;b')).toBe('a b');
    expect(stripHtml('R&amp;D')).toBe('R&D');
    expect(stripHtml('&lt;tag&gt;')).toBe('<tag>');
  });

  it('collapses whitespace introduced by block tags', () => {
    expect(stripHtml('<p>one</p><p>two</p>')).toBe('one two');
  });
});
