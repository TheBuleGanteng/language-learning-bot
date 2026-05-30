import { describe, it, expect } from 'vitest';
import { applyHotkeys } from '@/lib/special-chars';

describe('applyHotkeys', () => {
  it('replaces a backtick tone mark with a háček', () => {
    expect(applyHotkeys('a`', 2)).toEqual({ text: 'ǎ', cursorPos: 1 });
  });

  it('replaces e6 with the IPA ɛ', () => {
    expect(applyHotkeys('e6', 2)).toEqual({ text: 'ɛ', cursorPos: 1 });
  });

  it('leaves text alone when no rule matches', () => {
    expect(applyHotkeys('cat', 3)).toEqual({ text: 'cat', cursorPos: 3 });
  });

  it('replaces only the chars before the cursor, mid-word', () => {
    expect(applyHotkeys('hello a\\', 8)).toEqual({ text: 'hello à', cursorPos: 7 });
  });

  it('stacks a tone mark onto an already-converted IPA letter', () => {
    // After "e6" → "ɛ", typing "`" yields "ɛ`" which maps to "ɛ̌".
    expect(applyHotkeys('ɛ`', 2)).toEqual({ text: 'ɛ̌', cursorPos: 2 });
  });
});
