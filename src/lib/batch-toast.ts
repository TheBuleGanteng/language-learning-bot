// Pure progress-math for the bulk image-generation toast (Part 6). Kept
// side-effect-free so the label/variant/percent logic is testable without the
// React tree or a live batch.

export type BatchToast = {
  variant: 'progress' | 'success' | 'error' | 'stopped';
  label: string;
  /** 0..1 fill fraction for the progress bar. */
  pct: number;
};

const MAX_ERROR_LEN = 140;

/**
 * Map a batch snapshot to the toast that should be shown.
 *  - an `error` message → red error toast `Error: <message>` (message truncated)
 *  - `active` → green progress toast `Image generation underway (done/total)`
 *  - `stopped` (and no longer active) → amber `Image generation stopped (done/total)`
 *  - otherwise → green success toast `Image generation complete (completed/total)`
 *    with ` · N failed` appended when there were failures/refusals.
 *
 * `done = completed + failed + refused`; `pct = total ? done/total : 0`.
 */
export function batchToastState(args: {
  total: number;
  completed: number;
  failed: number;
  refused: number;
  active: boolean;
  error?: string | null;
  stopped?: boolean;
}): BatchToast {
  const { total, completed, failed, refused, active, error, stopped } = args;

  if (error) {
    const trimmed =
      error.length > MAX_ERROR_LEN ? `${error.slice(0, MAX_ERROR_LEN - 1)}…` : error;
    return { variant: 'error', label: `Error: ${trimmed}`, pct: 0 };
  }

  const done = completed + failed + refused;
  const pct = total > 0 ? done / total : 0;

  if (active) {
    return {
      variant: 'progress',
      label: `Image generation underway (${done}/${total})`,
      pct,
    };
  }

  if (stopped) {
    return {
      variant: 'stopped',
      label: `Image generation stopped (${done}/${total})`,
      pct,
    };
  }

  const failedTotal = failed + refused;
  const suffix = failedTotal > 0 ? ` · ${failedTotal} failed` : '';
  return {
    variant: 'success',
    label: `Image generation complete (${completed}/${total})${suffix}`,
    pct,
  };
}
