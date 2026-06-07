import { describe, it, expect } from 'vitest';
import {
  comprehensionFromStability,
  isComprehensionLevel,
  COMPREHENSION_STABILITY_THRESHOLDS as TH,
} from '@/lib/comprehension';
import { intersectIds } from '@/lib/vocab-bulk';

describe('comprehensionFromStability', () => {
  it('is not_tested when never reviewed (reps 0 or null stability)', () => {
    expect(comprehensionFromStability(null, 0)).toBe('not_tested');
    expect(comprehensionFromStability(100, 0)).toBe('not_tested'); // reps 0 wins
    expect(comprehensionFromStability(null, 5)).toBe('not_tested'); // no FSRS row
  });

  it('maps the low band: stability < lowMax', () => {
    expect(comprehensionFromStability(0.1, 1)).toBe('low');
    expect(comprehensionFromStability(TH.lowMax - 0.01, 3)).toBe('low'); // just below lowMax
  });

  it('maps the medium band: lowMax <= stability < mediumMax', () => {
    expect(comprehensionFromStability(TH.lowMax, 3)).toBe('medium'); // at lowMax
    expect(comprehensionFromStability(TH.mediumMax - 0.01, 9)).toBe('medium'); // just below mediumMax
  });

  it('maps the high band: stability >= mediumMax', () => {
    expect(comprehensionFromStability(TH.mediumMax, 9)).toBe('high'); // at mediumMax
    expect(comprehensionFromStability(365, 20)).toBe('high');
  });

  it('is deterministic from stability — a review overwrites any prior manual value', () => {
    // The function takes no prior state: a high-stability review yields 'high'
    // regardless of what the level was manually set to before.
    expect(comprehensionFromStability(50, 4)).toBe('high');
    expect(comprehensionFromStability(2, 4)).toBe('low');
  });
});

describe('isComprehensionLevel', () => {
  it('accepts the four levels and rejects anything else', () => {
    for (const l of ['not_tested', 'low', 'medium', 'high']) {
      expect(isComprehensionLevel(l)).toBe(true);
    }
    expect(isComprehensionLevel('HIGH')).toBe(false);
    expect(isComprehensionLevel('great')).toBe(false);
    expect(isComprehensionLevel(undefined)).toBe(false);
  });
});

// The comprehension + star endpoints are authorized by VIEWABILITY (own OR
// shared), NOT creator-ownership — this is personal per-user state. The settable
// set is `requested ∩ viewable`, deduped. These tests pin that contract.
describe('comprehension/star endpoint id scoping (view-scoped, multi-id, idempotent)', () => {
  it('a viewable-but-not-owned (shared) item is still settable', () => {
    const viewable = ['own1', 'shared-other']; // shared-other created by someone else but viewable
    expect(intersectIds(['shared-other'], viewable)).toEqual(['shared-other']);
  });
  it('drops items the user cannot view; keeps multiple viewable ones', () => {
    const viewable = new Set(['a', 'b', 'c']);
    expect(intersectIds(['a', 'b', 'hidden'], viewable)).toEqual(['a', 'b']);
  });
  it('de-dupes repeated ids so a row is written once (upsert idempotency)', () => {
    expect(intersectIds(['a', 'a', 'b'], ['a', 'b'])).toEqual(['a', 'b']);
  });
});
