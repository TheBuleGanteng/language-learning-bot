import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { vocabItems, vocabComprehension } from '@/db/schema';
import { apiUser } from '@/lib/api-auth';
import { vocabVisibleSql } from '@/lib/visibility';
import { intersectIds } from '@/lib/vocab-bulk';
import { COMPREHENSION_LEVELS } from '@/lib/comprehension';

const bodySchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1).max(2000),
  level: z.enum(COMPREHENSION_LEVELS),
});

/**
 * Manually set the CURRENT user's comprehension level for vocab items.
 *
 * Authorized by VIEWABILITY (own or shared), NOT creator-ownership — this is
 * personal per-user state (mirrors how starring is authorized). Idempotent
 * upsert on (user_id, vocab_item_id). The next practice of a card overwrites
 * this via the rate endpoint's recompute.
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
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }
  const requested = [...new Set(parsed.data.itemIds)];

  // Scope to items the user can view (own + shared) — no creator gate.
  const viewable = await db
    .select({ id: vocabItems.id })
    .from(vocabItems)
    .where(and(inArray(vocabItems.id, requested), vocabVisibleSql(user.id)));
  const ids = intersectIds(
    requested,
    viewable.map((v) => v.id),
  );

  if (ids.length > 0) {
    await db
      .insert(vocabComprehension)
      .values(ids.map((vocabItemId) => ({ userId: user.id, vocabItemId, level: parsed.data.level })))
      .onConflictDoUpdate({
        target: [vocabComprehension.userId, vocabComprehension.vocabItemId],
        set: { level: parsed.data.level, updatedAt: sql`now()` },
      });
  }

  return NextResponse.json({ updated: ids.length });
}
