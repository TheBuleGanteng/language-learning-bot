'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { vocabPath } from '@/lib/routes';

interface PendingNotification {
  batchId: string;
  requested: number;
  succeeded: number;
  failed: number;
  refused: number;
  stopped: boolean;
}

interface ActiveBatchResponse {
  active: boolean;
  pendingNotification?: PendingNotification;
}

const POLL_ACTIVE_MS = 5_000; // batch is running
const POLL_IDLE_MS = 15_000; // nothing happening, but watch for new batches
const POLL_BACKOFF_MS = 10_000; // network/server error

interface Props {
  /** User's target language — drives the "View failed items" URL. */
  userLang: string;
}

/**
 * Global poll for batch completion. Mounted in the (app) layout so the
 * popup can fire on whatever page the user is currently viewing — not
 * just the page that kicked off the batch.
 *
 * Polling never stops once the watcher is mounted:
 *  - active batch  → poll every 5s
 *  - pending popup → idle; polling resumes when the user dismisses
 *  - idle (nothing in flight, no pending) → poll every 15s so a batch
 *    started in another tab is picked up reasonably quickly
 *  - network/server error → 10s backoff
 *
 * The bulk-submit handler also dispatches a `batch-started` window
 * event so the next poll fires immediately rather than after the 15s
 * idle delay.
 */
export function BatchWatcher({ userLang }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingNotification | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  // Forward declaration so `schedule` and `poll` can reference each other.
  const pollRef = useRef<() => Promise<void>>(async () => {});

  const schedule = useCallback((delayMs: number) => {
    if (cancelledRef.current) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      void pollRef.current();
    }, delayMs);
  }, []);

  const poll = useCallback(async () => {
    if (cancelledRef.current) return;
    try {
      const res = await fetch('/api/vocab/active-batch');
      if (!res.ok) {
        schedule(POLL_BACKOFF_MS);
        return;
      }
      const data = (await res.json()) as ActiveBatchResponse;

      if (data.pendingNotification) {
        // Pop the dialog and stop polling. Polling resumes when the user
        // dismisses (see `dismiss` below) or when a new batch is started
        // (see the 'batch-started' event handler below).
        setPending(data.pendingNotification);
        return;
      }

      if (data.active) {
        // Batch in progress — poll quickly so we catch completion soon.
        schedule(POLL_ACTIVE_MS);
        return;
      }

      // Idle — no batch, no pending. Keep polling slowly so a batch
      // started in another tab (or via API) is picked up reasonably
      // quickly without forcing a page reload.
      schedule(POLL_IDLE_MS);
    } catch {
      schedule(POLL_BACKOFF_MS);
    }
  }, [schedule]);

  // Keep pollRef pointing at the latest closure so `schedule`'s setTimeout
  // callback always invokes the current version.
  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  const dismiss = useCallback(() => {
    setPending((prev) => {
      if (!prev) return null;
      // Best-effort fire-and-forget — if the POST fails the next poll
      // will resurface the same notification.
      void fetch('/api/vocab/active-batch/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: prev.batchId }),
      });
      return null;
    });
    // Restart the polling loop so the next batch is caught.
    schedule(0);
  }, [schedule]);

  // Listen for in-app event signaling a batch just kicked off. Cancel
  // any pending delay and poll immediately.
  useEffect(() => {
    function onBatchStarted() {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      void poll();
    }
    window.addEventListener('batch-started', onBatchStarted);
    return () => window.removeEventListener('batch-started', onBatchStarted);
  }, [poll]);

  // Initial mount: start polling. Cleanup cancels in-flight schedule.
  useEffect(() => {
    cancelledRef.current = false;
    void poll();
    return () => {
      cancelledRef.current = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [poll]);

  function viewFailedItems() {
    if (!pending) return;
    dismiss();
    router.push(`${vocabPath(userLang)}?imageStatus=failed`);
  }

  if (!pending) return null;

  const errors = pending.failed + pending.refused;
  const title = pending.stopped ? 'Batch stopped' : 'Image generation complete';

  return (
    <Dialog open onOpenChange={(open) => { if (!open) dismiss(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Images requested:</span>
            <span className="font-medium tabular-nums">{pending.requested}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Successfully created:</span>
            <span className="font-medium tabular-nums text-green-700">
              {pending.succeeded}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Errors:</span>
            <span
              className={`font-medium tabular-nums ${errors > 0 ? 'text-red-700' : ''}`}
            >
              {errors}
            </span>
          </div>
        </div>
        <DialogFooter className="flex gap-2">
          {errors > 0 && (
            <Button variant="outline" onClick={viewFailedItems}>
              View failed items
            </Button>
          )}
          <Button onClick={dismiss}>OK</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
