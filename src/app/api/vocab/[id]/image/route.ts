import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { vocabItems } from '@/db/schema';
import { auth } from '@/lib/auth';
import { storage } from '@/lib/storage';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Delete only the image for a vocab item. The vocab row itself is preserved
 * — status returns to 'none' so the user can re-generate later.
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const [item] = await db
    .select()
    .from(vocabItems)
    .where(and(eq(vocabItems.id, id), eq(vocabItems.userId, userId)))
    .limit(1);
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (item.imageStorageKey) {
    await storage().delete(item.imageStorageKey).catch(() => {});
  }

  await db
    .update(vocabItems)
    .set({
      imageStorageKey: null,
      imageStatus: 'none',
      imageGeneratedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(vocabItems.id, id));

  return NextResponse.json({ ok: true });
}
