// Window events that drive the global bulk image-generation toast (Part 6).
// The generate handlers fire these so the toast provider (mounted once,
// app-wide) is the single source of the progress/error toast regardless of
// which page triggered the batch.

export const BATCH_STARTED_EVENT = 'batch-started';
export const BATCH_ERROR_EVENT = 'bulk-gen-error';

/** Signal that a bulk batch just kicked off — the toast provider polls now. */
export function emitBatchStarted() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(BATCH_STARTED_EVENT));
}

/** Signal that a bulk batch failed to start — the toast provider shows the red toast. */
export function emitBatchError(message: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(BATCH_ERROR_EVENT, { detail: { message } }));
}
