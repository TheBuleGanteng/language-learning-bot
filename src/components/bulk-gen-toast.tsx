'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { withBase } from '@/lib/base-path';
import { batchToastState, type BatchToast } from '@/lib/batch-toast';
import { BATCH_STARTED_EVENT, BATCH_ERROR_EVENT } from '@/lib/bulk-gen-events';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

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

function ToastBody({ state, onStop }: { state: BatchToast; onStop?: () => void }) {
  // Elevated, semi-transparent surface that stays legible over the wallpaper.
  const surface =
    state.variant === 'error'
      ? 'bg-red-600/90'
      : state.variant === 'stopped'
        ? 'bg-amber-600/90'
        : 'bg-green-600/90';
  const pctWidth = `${Math.round(Math.min(1, Math.max(0, state.pct)) * 100)}%`;
  return (
    <div
      className={cn(
        'w-80 max-w-[90vw] rounded-lg p-3 text-white shadow-lg ring-1 ring-black/10 backdrop-blur',
        surface,
      )}
    >
      <div className="flex items-start gap-2">
        <span className="flex-1 text-sm font-medium leading-snug">{state.label}</span>
        {state.variant === 'progress' && onStop && (
          <button
            type="button"
            onClick={onStop}
            className="shrink-0 rounded border border-white/50 px-2 py-0.5 text-xs font-medium hover:bg-white/15 active:bg-white/25"
          >
            Stop
          </button>
        )}
      </div>
      {state.variant !== 'error' && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/30">
          <div className="h-1.5 rounded-full bg-white transition-all" style={{ width: pctWidth }} />
        </div>
      )}
    </div>
  );
}

/**
 * App-wide provider for the bulk image-generation progress toast. Mounted once
 * in Providers so it survives client-side navigation and reloads. Polls the
 * existing batch-status endpoint while a batch is active; never touches
 * single-item generation. Pinned bottom-left, with a Stop control that reuses
 * the in-page banner's stop path.
 */
export function BulkGenToast() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackingRef = useRef(false);
  const lastSnap = useRef<BatchSnapshot | null>(null);
  const pollRef = useRef<() => Promise<void>>(async () => {});
  // Set when the user stopped this batch from the toast — drives the 'stopped'
  // variant rather than a 'complete' one.
  const stoppedRef = useRef(false);
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);

  const requestStop = useCallback(() => setStopConfirmOpen(true), []);

  const render = useCallback(
    (state: BatchToast, duration: number) => {
      toast.custom(
        () => (
          <ToastBody state={state} onStop={state.variant === 'progress' ? requestStop : undefined} />
        ),
        { id: TOAST_ID, duration, position: 'bottom-left', unstyled: true, closeButton: false },
      );
    },
    [requestStop],
  );

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
        stop();
        return;
      }
      const data = (await res.json()) as { batch: BatchSnapshot | null };
      const snap = data.batch;
      if (snap) lastSnap.current = snap;

      if (snap && snap.inFlight) {
        trackingRef.current = true;
        stoppedRef.current = false;
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

      // Not active. If we were tracking, transition to stopped (only when the
      // toast's own Stop drove it) or success.
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
              stopped: stoppedRef.current,
            }),
            SUCCESS_DISMISS_MS,
          );
        } else {
          toast.dismiss(TOAST_ID);
        }
      }
      stop();
    } catch {
      if (trackingRef.current) {
        timer.current = setTimeout(() => void pollRef.current(), POLL_MS);
      } else {
        stop();
      }
    }
  }, [render, stop]);

  const pollNow = useCallback(() => {
    stop();
    void poll();
  }, [poll, stop]);

  // Proceed from the stop-confirm dialog: reflect 'stopped' immediately, then
  // call the same stop path the in-page banner uses.
  const proceedStop = useCallback(async () => {
    setStopConfirmOpen(false);
    stoppedRef.current = true;
    trackingRef.current = false;
    const s = lastSnap.current;
    if (s) {
      render(
        batchToastState({
          total: s.total,
          completed: s.completed,
          failed: s.failed,
          refused: s.refused,
          active: false,
          stopped: true,
        }),
        SUCCESS_DISMISS_MS,
      );
    }
    stop();
    try {
      await fetch(withBase('/api/vocab/generation-status'), { method: 'DELETE' });
    } catch {
      // The banner / next poll will reconcile; nothing else to do here.
    }
  }, [render, stop]);

  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  useEffect(() => {
    void poll();

    function onStarted() {
      stoppedRef.current = false;
      pollNow();
    }
    function onError(e: Event) {
      const message =
        (e as CustomEvent<{ message?: string }>).detail?.message ?? 'Generation failed';
      render(
        batchToastState({
          total: 0,
          completed: 0,
          failed: 0,
          refused: 0,
          active: false,
          error: message,
        }),
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

  return (
    <AlertDialog open={stopConfirmOpen} onOpenChange={setStopConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Stop image generation?</AlertDialogTitle>
          <AlertDialogDescription>
            This will stop the in-progress image generation
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Go back</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700"
            onClick={() => void proceedStop()}
          >
            Proceed
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
