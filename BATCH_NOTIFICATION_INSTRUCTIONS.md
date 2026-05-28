# Batch Completion Notification — Build Instructions

> Small spec. Adds cross-page completion notification for bulk image generation. Single commit at end, push to origin/main.

## Context

Bulk image generation can take 5-30+ minutes for medium batches. Users navigate away during the wait. We need a notification that fires when the batch completes regardless of which page the user is currently on.

Project path: `/home/thebuleganteng/01_Repos/06_personal_work/language-learning-bot`
Branch: `main`

## Requirements

When a bulk image generation batch finishes (or is stopped):

- A modal/dialog appears on whatever page the user is currently viewing
- **Title**: "Image generation complete" (or "Batch stopped" if cancelled)
- **Content**:
  - Images requested: X
  - Images successfully created: Y
  - Errors: Z (combines `failed` + `refused`)
- If errors > 0: a "View failed items" link that navigates to the vocab page with the `failed` filter applied
- An OK button + click-outside / escape key to dismiss

The notification must work even if the user is on `/settings`, a lesson page, etc. — not just the vocab page.

---

## Section 1 — Diagnose the current polling architecture

Before changing anything, read the existing code (from the previous filter fix):

1. How does polling currently work? Is it inside the vocab page component only, or somewhere else?
2. Where is the in-process batch state stored on the server?
3. Is there an existing way to query "is a batch active for this user, and what are its counts so far"?

If the current implementation polls only on the vocab page, polling needs to move to a global location (likely the authenticated layout) so it runs regardless of which page is mounted.

Write findings to ERROR_REPORT.md before making changes.

---

## Section 2 — Server-side: batch state endpoint

### 2.1 New API endpoint

Create `GET /api/vocab/active-batch` (or update the existing batch-status endpoint if one exists). Response shape:

```json
{
  "active": true,
  "batchId": "uuid-here",
  "startedAt": "2026-05-28T09:42:00Z",
  "requested": 50,
  "succeeded": 23,
  "failed": 1,
  "refused": 0,
  "remaining": 26,
  "stopped": false
}
```

When no batch is active for the current user:

```json
{
  "active": false
}
```

### 2.2 Batch state needs persistence beyond the in-process Map

Currently (per the original spec) the in-process executor stores batch state in a `BATCHES` Map in module scope. That's fine for one server process, but two problems for this feature:

1. **The notification needs to fire exactly once per batch.** If polling is naive and the batch state hangs around after completion, the notification fires forever.
2. **If the user reloads or navigates, the client needs a way to know "this batch I started 10 minutes ago — did it finish while I was away?"**

To handle this cleanly, add a small table:

```ts
// In src/db/schema.ts
export const imageGenerationBatches = pgTable('image_generation_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  requestedCount: integer('requested_count').notNull(),
  succeededCount: integer('succeeded_count').notNull().default(0),
  failedCount: integer('failed_count').notNull().default(0),
  refusedCount: integer('refused_count').notNull().default(0),
  stopped: boolean('stopped').notNull().default(false),
  // Client uses this to decide whether to show the notification.
  // Cleared when client acknowledges.
  notificationDismissedAt: timestamp('notification_dismissed_at', { withTimezone: true }),
}, (t) => ({
  userIdx: index('image_gen_batches_user_idx').on(t.userId, t.startedAt),
}));
```

Run `pnpm db:generate` and `pnpm db:migrate`.

### 2.3 Wire the executor to update this table

Update the bulk-generation entry point (`POST /api/vocab/generate-images` or wherever the batch starts):

1. INSERT a row into `imageGenerationBatches` with `requestedCount = vocabIds.length`
2. Pass the new batch ID into the in-process executor
3. After each image attempt, UPDATE the row's `succeededCount` / `failedCount` / `refusedCount`
4. When the executor finishes (queue empty OR stopped), set `finishedAt = NOW()`
5. If user clicked "Stop", set `stopped = true`

### 2.4 Endpoint logic

The `GET /api/vocab/active-batch` endpoint should:

1. Find the most recent batch for the user (highest `startedAt`)
2. If no batches exist → `{ active: false }`
3. If the batch is unfinished (`finishedAt IS NULL`) → return as active with current counts
4. If the batch is finished but `notificationDismissedAt IS NULL` → return as a completed-but-unacknowledged batch:

   ```json
   {
     "active": false,
     "pendingNotification": {
       "batchId": "...",
       "requested": 50,
       "succeeded": 49,
       "failed": 1,
       "refused": 0,
       "stopped": false,
       "finishedAt": "..."
     }
   }
   ```

5. If finished AND acknowledged → return `{ active: false }`

### 2.5 Acknowledge endpoint

`POST /api/vocab/active-batch/dismiss` accepting `{ batchId }`:

- Sets `notificationDismissedAt = NOW()` on that batch
- Returns `{ ok: true }`

### 2.6 Section commit

```
feat(batch): persist batch state in DB; expose active-batch endpoint with pending-notification
```

---

## Section 3 — Client-side: global polling and notification

### 3.1 Create a global batch-watcher component

Create `src/components/batch-watcher.tsx`:

This is a client component that:

1. Polls `/api/vocab/active-batch` every 5 seconds **only while a batch is active OR a notification is pending**
2. Stops polling otherwise
3. Renders a `Dialog` (shadcn) when `pendingNotification` is returned
4. On dismiss (OK button or close), calls `POST /api/vocab/active-batch/dismiss`

Approximate shape:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface BatchInfo {
  active: boolean;
  batchId?: string;
  requested?: number;
  succeeded?: number;
  failed?: number;
  refused?: number;
  remaining?: number;
  stopped?: boolean;
}

interface PendingNotification {
  batchId: string;
  requested: number;
  succeeded: number;
  failed: number;
  refused: number;
  stopped: boolean;
}

export function BatchWatcher({ userLang }: { userLang: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingNotification | null>(null);
  const [isBatchActive, setIsBatchActive] = useState(false);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    async function poll() {
      if (cancelled) return;
      try {
        const res = await fetch('/api/vocab/active-batch');
        if (!res.ok) return;
        const data = await res.json();

        if (data.active) {
          setIsBatchActive(true);
        } else {
          setIsBatchActive(false);
        }

        if (data.pendingNotification) {
          setPending(data.pendingNotification);
        }
      } catch {
        // Network error - silent; just retry on next interval
      } finally {
        if (!cancelled && (isBatchActive || pending === null)) {
          timeoutId = setTimeout(poll, 5000);
        }
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isBatchActive, pending]);

  async function dismiss() {
    if (!pending) return;
    const batchId = pending.batchId;
    // Optimistic clear
    setPending(null);
    try {
      await fetch('/api/vocab/active-batch/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId }),
      });
    } catch {
      // Best-effort; the user dismissed it locally
    }
  }

  function viewFailedItems() {
    dismiss();
    router.push(`/language/${userLang}/vocab?imageStatus=failed`);
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
        <div className="space-y-2 py-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Images requested:</span>
            <span className="font-medium tabular-nums">{pending.requested}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Successfully created:</span>
            <span className="font-medium tabular-nums text-green-700">{pending.succeeded}</span>
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

### 3.2 Polling logic fine points

A few things the rough sketch above gets right but worth highlighting:

- **Polling stops when there's no batch and no pending notification.** Don't waste server cycles on idle polling. The polling restarts naturally when the user kicks off a new batch (the main vocab page can trigger a "check now" via an event or just by virtue of the next 5-second tick).

- **Polling needs to start when a batch is kicked off** even if it wasn't polling before. Two clean ways:
  - Always poll at least once on mount, regardless of active state
  - Have the bulk-submit handler dispatch a custom event that the BatchWatcher listens to and triggers an immediate poll

  Use the first — simpler. The watcher mounts on every page, polls once on mount, then continues if active.

- **Backoff on network errors**: if `fetch` throws (offline, server down), don't hammer. Use a short backoff (10 sec instead of 5) on consecutive failures. Optional polish.

- **Dismissal is optimistic**: the modal closes immediately; the dismiss POST happens in the background. If the POST fails, the next poll will resurface the notification — annoying but correct.

### 3.3 Place the BatchWatcher in the authenticated layout

The watcher must be present on every authenticated page. Add it to the authenticated layout (likely `src/app/(app)/layout.tsx`):

```tsx
// Server component
import { auth } from '@/lib/auth';
import { getUserSettings } from '@/lib/user-settings';
import { BatchWatcher } from '@/components/batch-watcher';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const settings = await getUserSettings(session.user.id);
  const userLang = settings.targetLanguage;

  return (
    <>
      {/* existing nav, etc. */}
      {children}
      <BatchWatcher userLang={userLang} />
    </>
  );
}
```

Now every authenticated page has the watcher mounted.

### 3.4 Remove the existing polling logic on the vocab page

The vocab page from the previous fix has its own 5-second polling. Since the batch watcher now polls globally, the vocab page can simplify:

- Keep the polling on the vocab page for updating thumbnails / item counts (those need to refresh visibly)
- But the "is the batch done?" check is no longer the vocab page's concern — the BatchWatcher handles it

Alternatively, unify: the BatchWatcher exposes a context/event the vocab page can subscribe to, and refetches its data when an active batch reports new counts. This is cleaner but more code. **For v1, simpler to leave both polls running** — they're cheap, and they don't conflict. Note in ERROR_REPORT.md as a known follow-up: "Two polls running when on the vocab page during a batch (the BatchWatcher and the VocabList). Both are 5-second polls hitting different endpoints; could be unified."

### 3.5 Section commit

```
feat(batch): global batch watcher with cross-page completion notification
```

---

## Section 4 — Verification

### 4.1 Test plan

**Basic flow:**

- [ ] Kick off a small batch (5 items) from the vocab page
- [ ] Stay on the vocab page; watch items progress through `generating` → `completed`
- [ ] When the last item completes, popup appears: "Image generation complete", Requested: 5, Succeeded: 5, Errors: 0
- [ ] Click OK → popup dismisses
- [ ] Reload page → no popup re-appears

**Cross-page:**

- [ ] Kick off a slightly larger batch (10 items, ~80 seconds)
- [ ] Immediately navigate to `/settings`
- [ ] Wait for the batch to complete
- [ ] Popup appears on the Settings page
- [ ] Click OK → dismisses

**Errors:**

- [ ] Set OpenAI hard limit very low (e.g., $0.10 in OpenAI's dashboard, not your app's hard stop)
- [ ] Kick off a batch larger than the limit allows
- [ ] After completion, popup shows non-zero Errors
- [ ] "View failed items" button visible
- [ ] Click → navigates to vocab page with image-status filter set to failed
- [ ] Reset OpenAI hard limit after testing

**Stop:**

- [ ] Kick off a 20-item batch
- [ ] Click "Stop" on the in-progress UI
- [ ] After remaining queued items wrap (a few seconds), popup appears
- [ ] Title is "Batch stopped" instead of "Image generation complete"
- [ ] Counts reflect what was actually processed up to the stop point

**Reload survival:**

- [ ] Kick off a 5-item batch
- [ ] Reload the page mid-batch
- [ ] After reload, polling resumes and the batch completes correctly
- [ ] Popup appears as expected
- [ ] Close the browser tab, reopen `localhost:3000` — if the batch finished while you were away, the popup should appear when you load any authenticated page

**No duplicate notifications:**

- [ ] After receiving and dismissing a popup, reload the page
- [ ] No popup re-appears (DB has `notificationDismissedAt` set)

### 4.2 DB check

```bash
docker exec -i language-learning-bot-postgres-1 psql -U lang -d language_learning -c "SELECT id, started_at, finished_at, requested_count, succeeded_count, failed_count, refused_count, stopped, notification_dismissed_at FROM image_generation_batches ORDER BY started_at DESC LIMIT 5;" | cat
```

Each batch row should have:
- `started_at` set
- `finished_at` set when done
- Counts that sum correctly
- `notification_dismissed_at` set after user clicked OK

### 4.3 Automated checks

```bash
pnpm lint        # 0 errors
pnpm test        # all unit tests pass
pnpm test:e2e    # E2E still passes
pnpm build       # successful production build
```

### 4.4 Update ERROR_REPORT.md

```markdown
## Batch completion notification

### Changes
- New `image_generation_batches` table tracks batch lifecycle and dismissal state
- `GET /api/vocab/active-batch` returns either active batch info or a pending-notification payload
- `POST /api/vocab/active-batch/dismiss` marks a batch's notification as seen
- BatchWatcher client component mounted in the authenticated layout polls every 5s
  while a batch is active or a notification is pending; idle otherwise
- Cross-page popup with Requested/Succeeded/Errors counts; "Batch stopped" variant on cancellation
- "View failed items" link navigates to vocab page with status=failed filter

### Known follow-ups
- The vocab page still runs its own 5-second polling for thumbnail refresh; the BatchWatcher
  also polls globally. Two redundant polls when on the vocab page during a batch. Could
  be unified by having the vocab page subscribe to BatchWatcher's state via context.
- No native browser notification (would require permission prompt and service worker)
- No sound on completion (could be a future option)
```

### 4.5 Push

```bash
git push origin main
```

---

## Defaults you may apply silently

- Exact polling interval (5 seconds suggested)
- Backoff on network errors (10 seconds suggested)
- Specific Tailwind classes / shadcn variants for the popup
- Whether to also auto-dismiss after a long timeout (suggested: no — make the user click)

## Things to check back on

- If the existing batch executor doesn't have a clean integration point for "update progress as each image finishes" — adapt; the row update may need to happen inside the executor's per-image callback
- If the `imageGenerationBatches` table schema name clashes with any existing variable named `BATCHES` or similar — rename if so

## Out of scope (do NOT build)

- Browser Notifications API (requires permission, more complex)
- Sound alert on completion
- Notification persistence across browser sessions beyond what the DB already provides
- Batch history view ("show me all my past batches")

---

## End of spec

Start with Section 1 (diagnose). Commit per section. Update ERROR_REPORT.md. Push to origin/main.