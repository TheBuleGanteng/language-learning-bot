import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { vocabItems, vocabOrder } from '@/db/schema';
import { apiUser } from '@/lib/api-auth';
import { vocabVisibleSql } from '@/lib/visibility';
import { computeInsertPosition, ORDER_STEP } from '@/lib/manual-order';

// Per-user manual ordering of vocab items (Part 3). Ordering is PERSONAL — any
// viewable item can be ordered (own or shared), no creator gate.

const patchSchema = z.object({
  movedId: z.string().uuid(),
  // The visible neighbours AFTER the drop: the item directly above the moved
  // item and the item directly below it. Absent ⇒ dropped at that end.
  beforeId: z.string().uuid().optional(),
  afterId: z.string().uuid().optional(),
});

/**
 * PATCH — record a single drag. Lazily materializes a full per-user ordering for
 * every viewable item (in the default newest-first order) on the FIRST drag,
 * then sets ONLY the moved item's position to the midpoint of its new visible
 * neighbours. Touching just the one item preserves the relative order of items
 * hidden by a filter / lesson scope — which is what "one global order" requires.
 */
export async function PATCH(req: Request) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  const { movedId, beforeId, afterId } = parsed.data;

  // The moved item must be viewable by this user.
  const [viewable] = await db
    .select({ id: vocabItems.id })
    .from(vocabItems)
    .where(and(eq(vocabItems.id, movedId), vocabVisibleSql(user.id)))
    .limit(1);
  if (!viewable) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await db.transaction(async (tx) => {
    // Lazy full-set initialization on the first reorder.
    const [mc] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(vocabOrder)
      .where(eq(vocabOrder.userId, user.id));
    if ((mc?.n ?? 0) === 0) {
      await tx.execute(sql`
        INSERT INTO vocab_order (user_id, vocab_item_id, position)
        SELECT ${user.id}, vocab_items.id,
               (row_number() OVER (ORDER BY vocab_items.created_at DESC, vocab_items.id)) * ${ORDER_STEP}
        FROM vocab_items
        WHERE ${vocabVisibleSql(user.id)}
        ON CONFLICT DO NOTHING
      `);
    }

    const posOf = async (id?: string): Promise<number | null> => {
      if (!id) return null;
      const [row] = await tx
        .select({ position: vocabOrder.position })
        .from(vocabOrder)
        .where(and(eq(vocabOrder.userId, user.id), eq(vocabOrder.vocabItemId, id)))
        .limit(1);
      return row?.position ?? null;
    };
    const beforePos = await posOf(beforeId);
    const afterPos = await posOf(afterId);
    const position = computeInsertPosition(beforePos, afterPos);

    await tx
      .insert(vocabOrder)
      .values({ userId: user.id, vocabItemId: movedId, position })
      .onConflictDoUpdate({
        target: [vocabOrder.userId, vocabOrder.vocabItemId],
        set: { position, updatedAt: new Date() },
      });
  });

  return NextResponse.json({ ok: true });
}

/** DELETE — clear this user's manual vocab order (revert to the computed sort). */
export async function DELETE() {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await db.delete(vocabOrder).where(eq(vocabOrder.userId, user.id));
  return NextResponse.json({ ok: true });
}
