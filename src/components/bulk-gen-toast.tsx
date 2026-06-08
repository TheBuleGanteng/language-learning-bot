'use client';

import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { withBase } from '@/lib/base-path';
import { batchToastState, type BatchToast } from '@/lib/batch-toast';
import { BATCH_STARTED_EVENT, BATCH_ERROR_EVENT } from '@/lib/bulk-gen-events';
import { cn } from '@/lib/utils';

// One stable toast id so every update replaces the same toast in place rather
// than stacking a new one each poll.
const TOAST_ID = 'bulk-gen-progress';
const POLL_MS = 5_000;
const SUCCESS_DISMISS_MS = 5_000;
const ERROR_DISMISS_MS = 8_000;

interface BatchSnapshot {
  total: number;
  completed: number;
  failed: number;
  refused: number;
  inFlight: boolean;
}

function ToastBody({ state }: { state: BatchToast }) {
  const barColor =
    state.variant === 'error'
      ? 'bg-red-600'
      : state.variant === 'success'
        ? 'bg-green-600'
        : 'bg-green-500';
  return (
    <div className="flex w-full flex-col gap-1.5">
      <span className="text-sm font-medium">{state.label}</span>
      {state.variant !== 'error' && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn('h-1.5 rounded-full transition-all', barColor)}
            style={{ width: `${Math.round(Math.min(1, Math.max(0, state.pct)) * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * App-wide provider for the bulk image-generation progress toast (Part 6).
 * Mounted once in Providers so it survives client-side navigation and reloads.
 * Polls the existing batch-status endpoint while a batch is active; never
 * touches single-item generation.
 */
export function BulkGenToast() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Whether we're currently tracking an in-flight batch (so we know to flip to
  // a success toast when it finishes).
  const trackingRef = useRef(false);
  const lastSnap = useRef<BatchSnapshot | null>(null);
  // Forward ref so the scheduled timeout always calls the latest `poll`.
  const pollRef = useRef<() => Promise<void>>(async () => {});

  const render = useCallback((state: BatchToast, duration: number) => {
    toast.custom(() => <ToastBody state={state} />, { id: TOAST_ID, duration });
  }, []);

  const stop = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(withBase('/api/vocab/generation-status'));
      if (!res.ok) {
        // Unauthenticated / transient — don't spam; just stop the loop.
        stop();
        return;
      }
      const data = (await res.json()) as { batch: BatchSnapshot | null };
      const snap = data.batch;
      if (snap) lastSnap.current = snap;

      if (snap && snap.inFlight) {
        trackingRef.current = true;
        render(
          batchToastState({
            total: snap.total,
            completed: snap.completed,
            failed: snap.failed,
            refused: snap.refused,
            active: true,
          }),
          Infinity,
        );
        timer.current = setTimeout(() => void pollRef.current(), POLL_MS);
        return;
      }

      // Not active. If we had been tracking a batch, flip to a success toast.
      if (trackingRef.current) {
        trackingRef.current = false;
        const s = snap ?? lastSnap.current;
        if (s) {
          render(
            batchToastState({
              total: s.total,
              completed: s.completed,
              failed: s.failed,
              refused: s.refused,
              active: false,
            }),
            SUCCESS_DISMISS_MS,
          );
        } else {
          toast.dismiss(TOAST_ID);
        }
      }
      stop();
    } catch {
      // Network blip — retry quietly once after the normal interval rather than
      // killing the loop while a batch may still be running.
      if (trackingRef.current) {
        timer.current = setTimeout(() => void pollRef.current(), POLL_MS);
      } else {
        stop();
      }
    }
  }, [render, stop]);

  // Kick a poll immediately, cancelling any scheduled one.
  const pollNow = useCallback(() => {
    stop();
    void poll();
  }, [poll, stop]);

  // Keep the forward ref pointing at the latest poll closure.
  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  useEffect(() => {
    // Resume on mount / reload: one status check; if a batch is active the loop
    // re-attaches the progress toast.
    void poll();

    function onStarted() {
      pollNow();
    }
    function onError(e: Event) {
      const message = (e as CustomEvent<{ message?: string }>).detail?.message ?? 'Generation failed';
      render(
        batchToastState({ total: 0, completed: 0, failed: 0, refused: 0, active: false, error: message }),
        ERROR_DISMISS_MS,
      );
    }
    window.addEventListener(BATCH_STARTED_EVENT, onStarted);
    window.addEventListener(BATCH_ERROR_EVENT, onError);
    return () => {
      window.removeEventListener(BATCH_STARTED_EVENT, onStarted);
      window.removeEventListener(BATCH_ERROR_EVENT, onError);
      stop();
    };
  }, [poll, pollNow, render, stop]);

  return null;
}
