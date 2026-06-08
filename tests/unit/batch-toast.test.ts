import { describe, it, expect } from 'vitest';
import { batchToastState } from '@/lib/batch-toast';

describe('batchToastState', () => {
  it('progress: label + pct mid-batch (done = completed+failed+refused)', () => {
    const s = batchToastState({
      total: 10,
      completed: 3,
      failed: 1,
      refused: 0,
      active: true,
    });
    expect(s.variant).toBe('progress');
    expect(s.label).toBe('Image generation underway (4/10)');
    expect(s.pct).toBeCloseTo(0.4);
  });

  it('success: complete label with no failures', () => {
    const s = batchToastState({
      total: 5,
      completed: 5,
      failed: 0,
      refused: 0,
      active: false,
    });
    expect(s.variant).toBe('success');
    expect(s.label).toBe('Image generation complete (5/5)');
    expect(s.pct).toBe(1);
  });

  it('success: appends "· N failed" when there were failures/refusals', () => {
    const s = batchToastState({
      total: 5,
      completed: 3,
      failed: 1,
      refused: 1,
      active: false,
    });
    expect(s.variant).toBe('success');
    expect(s.label).toBe('Image generation complete (3/5) · 2 failed');
  });

  it('error: red variant with the message, regardless of counts', () => {
    const s = batchToastState({
      total: 0,
      completed: 0,
      failed: 0,
      refused: 0,
      active: false,
      error: 'Spend cap reached',
    });
    expect(s.variant).toBe('error');
    expect(s.label).toBe('Error: Spend cap reached');
  });

  it('error: truncates very long messages', () => {
    const long = 'x'.repeat(500);
    const s = batchToastState({
      total: 0,
      completed: 0,
      failed: 0,
      refused: 0,
      active: false,
      error: long,
    });
    expect(s.variant).toBe('error');
    expect(s.label.length).toBeLessThan(160);
    expect(s.label.endsWith('…')).toBe(true);
  });

  it('progress: pct is 0 when total is 0 (no divide-by-zero)', () => {
    const s = batchToastState({ total: 0, completed: 0, failed: 0, refused: 0, active: true });
    expect(s.pct).toBe(0);
  });
});
