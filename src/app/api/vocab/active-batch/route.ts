import { NextResponse } from 'next/server';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { imageGenerationBatches } from '@/db/schema';
import { auth } from '@/lib/auth';

/**
 * Cross-page batch-status endpoint. Returns one of:
 *
 *  - `{ active: true, batchId, ... counts }` — a batch is in flight for the
 *    current user. The BatchWatcher uses this to keep polling.
 *  - `{ active: false, pendingNotification: { ... } }` — most-recent batch
 *    has finished but the client hasn't acknowledged it yet. BatchWatcher
 *    pops the completion dialog and POSTs to /dismiss when the user
 *    clicks OK / closes.
 *  - `{ active: false }` — no in-flight batch, no unacknowledged finish.
 *    BatchWatcher idles until the next mount.
 */
export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Most-recent in-flight batch wins
  const [active] = await db
    .select()
    .from(imageGenerationBatches)
    .where(
      and(
        eq(imageGenerationBatches.userId, userId),
        isNull(imageGenerationBatches.finishedAt),
      ),
    )
    .orderBy(desc(imageGenerationBatches.startedAt))
    .limit(1);

  if (active) {
    const remaining =
      active.requestedCount -
      active.succeededCount -
      active.failedCount -
      active.refusedCount;
    return NextResponse.json({
      active: true,
      batchId: active.id,
      startedAt: active.startedAt,
      requested: active.requestedCount,
      succeeded: active.succeededCount,
      failed: active.failedCount,
      refused: active.refusedCount,
      remaining: Math.max(0, remaining),
      stopped: active.stopped,
    });
  }

  // No in-flight batch; check for an unacknowledged finished one
  const [pending] = await db
    .select()
    .from(imageGenerationBatches)
    .where(
      and(
        eq(imageGenerationBatches.userId, userId),
        isNull(imageGenerationBatches.notificationDismissedAt),
      ),
    )
    .orderBy(desc(imageGenerationBatches.startedAt))
    .limit(1);

  if (pending && pending.finishedAt) {
    return NextResponse.json({
      active: false,
      pendingNotification: {
        batchId: pending.id,
        requested: pending.requestedCount,
        succeeded: pending.succeededCount,
        failed: pending.failedCount,
        refused: pending.refusedCount,
        stopped: pending.stopped,
        finishedAt: pending.finishedAt,
      },
    });
  }

  return NextResponse.json({ active: false });
}
