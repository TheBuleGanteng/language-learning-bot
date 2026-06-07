import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { vocabItems, vocabStars } from '@/db/schema';
import { apiUser } from '@/lib/api-auth';
import { vocabVisibleSql } from '@/lib/visibility';
import { intersectIds } from '@/lib/vocab-bulk';

const bodySchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1).max(2000),
  starred: z.boolean(),
});

/**
 * Star / unstar vocab items for the CURRENT user.
 *
 * Authorized by VIEWABILITY (own or shared), NOT creator-ownership — personal
 * per-user state. `starred:true` inserts idempotently (ON CONFLICT DO NOTHING);
 * `false` deletes (no-op when absent). Idempotent either way.
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

  const viewable = await db
    .select({ id: vocabItems.id })
    .from(vocabItems)
    .where(and(inArray(vocabItems.id, requested), vocabVisibleSql(user.id)));
  const ids = intersectIds(
    requested,
    viewable.map((v) => v.id),
  );

  if (ids.length > 0) {
    if (parsed.data.starred) {
      await db
        .insert(vocabStars)
        .values(ids.map((vocabItemId) => ({ userId: user.id, vocabItemId })))
        .onConflictDoNothing();
    } else {
      await db
        .delete(vocabStars)
        .where(and(eq(vocabStars.userId, user.id), inArray(vocabStars.vocabItemId, ids)));
    }
  }

  return NextResponse.json({ updated: ids.length });
}
