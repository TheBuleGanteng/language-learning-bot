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

const POLL_INTERVAL_MS = 5000;
const BACKOFF_INTERVAL_MS = 10_000;

interface Props {
  /** User's target language — drives the "View failed items" URL. */
  userLang: string;
}

/**
 * Global poll for batch completion. Mounted in the (app) layout so the
 * popup can fire on whatever page the user is currently viewing — not
 * just the page that kicked off the batch.
 *
 * Polling stops when there's no active batch and no pending dialog.
 * It restarts on the next mount (page reload, navigation).
 */
export function BatchWatcher({ userLang }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingNotification | null>(null);
  const cancelledRef = useRef(false);

  const dismiss = useCallback(async () => {
    setPending((prev) => {
      if (!prev) return null;
      // Fire-and-forget — best-effort. If the POST fails the next poll
      // will resurface the same notification.
      void fetch('/api/vocab/active-batch/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: prev.batchId }),
      });
      return null;
    });
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let stopRequested = false;

    async function poll() {
      if (cancelledRef.current || stopRequested) return;
      let nextDelay = POLL_INTERVAL_MS;
      let keepPolling = true;
      try {
        const res = await fetch('/api/vocab/active-batch');
        if (!res.ok) {
          nextDelay = BACKOFF_INTERVAL_MS;
        } else {
          const data = (await res.json()) as ActiveBatchResponse;
          if (data.pendingNotification) {
            setPending(data.pendingNotification);
            // Once the popup is on screen we stop polling. Polling
            // resumes on the next mount (re-render / route change).
            keepPolling = false;
          } else if (!data.active) {
            // Nothing active, nothing pending — idle until next mount.
            keepPolling = false;
          }
        }
      } catch {
        nextDelay = BACKOFF_INTERVAL_MS;
      }
      if (keepPolling && !cancelledRef.current && !stopRequested) {
        timeoutId = setTimeout(poll, nextDelay);
      }
    }

    // Always poll once on mount so a newly-kicked-off batch on another
    // tab / a finished-while-away notification is picked up.
    poll();

    return () => {
      cancelledRef.current = true;
      stopRequested = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  function viewFailedItems() {
    if (!pending) return;
    const lang = userLang;
    void dismiss();
    router.push(`${vocabPath(lang)}?imageStatus=failed`);
  }

  if (!pending) return null;

  const errors = pending.failed + pending.refused;
  const title = pending.stopped ? 'Batch stopped' : 'Image generation complete';

  return (
    <Dialog open onOpenChange={(open) => { if (!open) void dismiss(); }}>
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
          <Button onClick={() => void dismiss()}>OK</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
