import { NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { deckItems, cardReviews, vocabItems, vocabTags, vocabLessons } from '@/db/schema';
import { apiUser } from '@/lib/api-auth';
import { requireDeckOwner, buildNewCardReviews, type DeckDirection } from '@/lib/decks';
import { vocabVisibleSql } from '@/lib/visibility';

/**
 * POST /api/decks/[id]/refresh — re-sync a tag/lesson-sourced deck against its
 * current source. Body `{ dryRun?: boolean }` (or `?dryRun=true`) returns the
 * add/remove counts without applying them. Manual decks cannot be refreshed.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;

  const owner = await requireDeckOwner(id, user.id);
  if (!owner.ok) {
    return NextResponse.json(
      { error: owner.status === 403 ? 'Forbidden' : 'Not found' },
      { status: owner.status },
    );
  }
  const deck = owner.deck;

  if (deck.source === 'manual' || !deck.sourceId) {
    return NextResponse.json({ error: 'Manual decks cannot be refreshed' }, { status: 400 });
  }

  const url = new URL(req.url);
  let dryRun = url.searchParams.get('dryRun') === 'true';
  try {
    const body = await req.json();
    if (body && typeof body === 'object' && 'dryRun' in body) {
      dryRun = Boolean((body as { dryRun?: unknown }).dryRun);
    }
  } catch {
    // no body — fall back to the query param
  }

  // Re-query the source for vocab items visible to this user.
  const sourceRows =
    deck.source === 'tag'
      ? await db
          .selectDistinct({ id: vocabItems.id })
          .from(vocabItems)
          .innerJoin(vocabTags, eq(vocabTags.vocabItemId, vocabItems.id))
          .where(and(eq(vocabTags.tagId, deck.sourceId), vocabVisibleSql(user.id)))
      : await db
          .selectDistinct({ id: vocabItems.id })
          .from(vocabItems)
          .innerJoin(vocabLessons, eq(vocabLessons.vocabItemId, vocabItems.id))
          .where(and(eq(vocabLessons.lessonId, deck.sourceId), vocabVisibleSql(user.id)));
  const sourceIds = new Set(sourceRows.map((r) => r.id));

  const currentRows = await db
    .select({ vocabItemId: deckItems.vocabItemId })
    .from(deckItems)
    .where(eq(deckItems.deckId, id));
  const currentIds = new Set(currentRows.map((r) => r.vocabItemId));

  const toAdd = [...sourceIds].filter((vid) => !currentIds.has(vid));
  const toRemove = [...currentIds].filter((vid) => !sourceIds.has(vid));

  if (dryRun) {
    return NextResponse.json({ added: toAdd.length, removed: toRemove.length });
  }

  await db.transaction(async (tx) => {
    if (toRemove.length) {
      await tx
        .delete(deckItems)
        .where(and(eq(deckItems.deckId, id), inArray(deckItems.vocabItemId, toRemove)));
      // card_reviews for removed items cascade via the deck_items delete? No —
      // card_reviews FK is on deck_id/vocab_item_id, not deck_items. Remove
      // explicitly so orphaned reviews don't linger.
      await tx
        .delete(cardReviews)
        .where(and(eq(cardReviews.deckId, id), inArray(cardReviews.vocabItemId, toRemove)));
    }
    if (toAdd.length) {
      await tx
        .insert(deckItems)
        .values(toAdd.map((vocabItemId) => ({ deckId: id, vocabItemId })))
        .onConflictDoNothing();
      await tx
        .insert(cardReviews)
        .values(buildNewCardReviews(id, toAdd, deck.direction as DeckDirection))
        .onConflictDoNothing();
    }
  });

  return NextResponse.json({ added: toAdd.length, removed: toRemove.length });
}
