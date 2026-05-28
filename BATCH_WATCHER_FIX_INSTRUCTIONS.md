# BatchWatcher Polling Fix — Build Instructions

> Tiny spec. One focused bug in `src/components/batch-watcher.tsx`. Single commit, push to origin/main.

## Context

The BatchWatcher polling logic has a bug: when its first poll finds no active batch and no pending notification, it stops polling permanently. The `(app)` layout doesn't unmount on internal navigation, so the watcher never re-mounts and never picks up batches started after the initial mount. Reload is the only thing that revives it.

User-visible symptom: bulk-generation completion popup only appears after a manual page reload.

Project path: `/home/thebuleganteng/01_Repos/06_personal_work/language-learning-bot`
Branch: `main`

---

## Section 1 — The fix

### 1.1 Refactor the polling so `poll` is callable from outside `useEffect`

In `src/components/batch-watcher.tsx`, extract the poll function so:
- The initial mount kicks off one poll
- Idle state polls every 15 seconds instead of stopping
- A custom `batch-started` window event can trigger an immediate poll
- Dismissing the popup restarts polling so subsequent batches are caught

Replace the existing `useEffect` and component body with this implementation. Preserve everything outside that block (imports, types, the dialog JSX):

```tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
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

const POLL_ACTIVE_MS = 5_000;     // batch is running
const POLL_IDLE_MS = 15_000;      // nothing happening, but watch for new batches
const POLL_BACKOFF_MS = 10_000;   // network/server error

interface Props { userLang: string; }

export function BatchWatcher({ userLang }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingNotification | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  const schedule = useCallback((delayMs: number) => {
    if (cancelledRef.current) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(poll, delayMs);
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

      // Idle — no batch, no pending. Keep polling slowly in case a batch
      // starts (this is the key fix: the previous version stopped here).
      schedule(POLL_IDLE_MS);
    } catch {
      schedule(POLL_BACKOFF_MS);
    }
  }, [schedule]);

  const dismiss = useCallback(() => {
    setPending((prev) => {
      if (!prev) return null;
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

  // Listen for in-app event signaling a batch just kicked off.
  useEffect(() => {
    function onBatchStarted() {
      // Cancel any pending delay and poll right now.
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
            <span className={`font-medium tabular-nums ${errors > 0 ? 'text-red-700' : ''}`}>
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
```

### 1.2 Dispatch the `batch-started` event from the bulk-submit handler

Find the vocab page component that handles the bulk-generation submit (the one that POSTs to `/api/vocab/generate-images`). Likely in `src/app/(app)/language/[lang]/vocab/page.tsx` or a client component imported by it.

After a successful POST to the generate-images endpoint, dispatch the custom event:

```ts
const res = await fetch('/api/vocab/generate-images', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ vocabIds: selectedIds }),
});

if (res.ok) {
  // Tell the global BatchWatcher to poll immediately.
  window.dispatchEvent(new CustomEvent('batch-started'));
  // ...existing post-submit logic (exit selection mode, etc.)
}
```

This is the only line that needs adding to the bulk-submit flow. Just make sure to fire it after the response is OK, not before.

### 1.3 Section commit

```
fix(batch): keep watcher polling when idle so new batches are detected without reload
```

---

## Section 2 — Verification

### 2.1 Test the actual bug

The original failing case:

1. Sign in, navigate around without starting a batch (just to be sure the watcher has mounted and is in its idle state)
2. Go to `/language/th/vocab`
3. Open DevTools → Network tab → filter to Fetch/XHR → clear
4. Kick off a small batch (3 items)
5. **Stay on the vocab page**, don't reload
6. **You should see**:
   - One immediate `/api/vocab/active-batch` request (from the `batch-started` event)
   - Then repeated `/api/vocab/active-batch` requests every 5 seconds
   - When the batch completes (~30 seconds), the popup appears WITHOUT requiring a reload
7. Click OK → popup dismisses
8. Network tab: the watcher resumes polling at the 15-second idle cadence

### 2.2 Cross-page test (the original feature)

1. Kick off a 5-item batch
2. Navigate to `/settings` immediately
3. Network tab: requests to `/api/vocab/active-batch` continue every 5 seconds from the Settings page
4. When the batch completes, the popup appears on the Settings page ✓

### 2.3 Idle polling

1. With no batches active, sit on any page for 30 seconds
2. Network tab: requests to `/api/vocab/active-batch` every 15 seconds
3. This is the baseline cost of having the watcher always-on. ~4 requests per minute. Acceptable.

### 2.4 Multiple batches in sequence

1. Run a small batch → wait for completion popup → click OK
2. Network tab: idle 15s polling resumes immediately
3. Kick off another batch
4. Network tab: shifts back to 5s active polling, popup fires on completion

### 2.5 Stopped batch

1. Kick off a 10-item batch
2. Click "Stop" partway through
3. Popup appears with title "Batch stopped" and current counts
4. Dismiss → idle polling resumes

### 2.6 Automated checks

```bash
pnpm lint        # 0 errors
pnpm test        # all unit tests pass
pnpm build       # successful production build
```

### 2.7 Update ERROR_REPORT.md

Append to the batch-notification section:

```markdown
### Follow-up fix (post-initial-build)

Discovered via testing: the watcher's polling loop terminated on first idle
response. Because the `(app)` layout is persistent (doesn't unmount on internal
navigation), the watcher stopped polling permanently on first login and only
revived on full page reload. Symptoms: bulk completion popup only appeared
after manual reload.

Fix: idle polls continue at a slow cadence (15s) instead of stopping. A
custom `batch-started` window event dispatched from the bulk-submit handler
gives the watcher an immediate signal when a new batch begins, avoiding up
to 15s of detection lag.
```

### 2.8 Push

```bash
git push origin main
```

---

## Things to check back on

- The two `useEffect` blocks must not have `poll` or `schedule` change identity unexpectedly on every render. `useCallback` with stable deps handles this — verify nothing causes infinite re-render loops.
- If the existing vocab page already dispatches its own events (or has a context exposing batch state), use that instead of inventing a new custom event. Custom events are a last resort when there's no shared state to subscribe to.
- If there's a way to make the `(app)` layout key off `batch-state` such that it remounts the watcher cleanly when a new batch begins, that's also acceptable — but the custom-event approach is simpler.

---

## End of spec

Single commit. Push to origin/main. Verify with the test plan in Section 2.