import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { vocabItems } from '@/db/schema';
import { auth } from '@/lib/auth';
import { generateImageForVocabItem } from '@/lib/image-gen/executor';
import { storage } from '@/lib/storage';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Synchronous single-image generation. Used for both "first generate" and
 * "regenerate" — the executor already deletes the previous image file when
 * one exists. Hard-stop pre-flight runs inside generateImageForVocabItem.
 */
export async function POST(
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
    .select({ id: vocabItems.id })
    .from(vocabItems)
    .where(and(eq(vocabItems.id, id), eq(vocabItems.userId, userId)))
    .limit(1);
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await db
    .update(vocabItems)
    .set({ imageStatus: 'generating', updatedAt: new Date() })
    .where(eq(vocabItems.id, id));

  const result = await generateImageForVocabItem(userId, id);

  if (result.status === 'hard_stop') {
    return NextResponse.json(
      {
        error: 'hard_stop_exceeded',
        message:
          "You've reached your monthly image-generation hard stop. " +
          'Raise it in Settings, or wait until the first of next month.',
      },
      { status: 402 },
    );
  }

  // Re-read so the response has the new key + URL
  const [updated] = await db
    .select()
    .from(vocabItems)
    .where(eq(vocabItems.id, id))
    .limit(1);
  const imageUrl = updated?.imageStorageKey
    ? storage().publicUrl(updated.imageStorageKey)
    : null;

  return NextResponse.json({
    status: result.status,
    bandCrossed: result.bandCrossed ?? null,
    imageStatus: updated?.imageStatus,
    imageUrl,
  });
}
