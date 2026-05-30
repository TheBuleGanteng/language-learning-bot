import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { deckItems, cardReviews, vocabItems } from '@/db/schema';
import { apiUser } from '@/lib/api-auth';
import { requireDeckOwner, buildNewCardReviews, type DeckDirection } from '@/lib/decks';
import { vocabVisibleSql } from '@/lib/visibility';

const itemsSchema = z.object({
  vocabItemIds: z.array(z.string().uuid()).min(1).max(2000),
});

// POST /api/decks/[id]/items — add vocab items to an existing deck, skipping
// duplicates. New items get card_reviews for the deck's current direction.
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = itemsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  const requested = [...new Set(parsed.data.vocabItemIds)];
  // Only items the caller can see are eligible.
  const visible = await db
    .select({ id: vocabItems.id })
    .from(vocabItems)
    .where(and(inArray(vocabItems.id, requested), vocabVisibleSql(user.id)));
  const visibleIds = visible.map((v) => v.id);

  const added = await db.transaction(async (tx) => {
    if (visibleIds.length === 0) return [] as string[];
    // onConflictDoNothing + returning gives us exactly the rows newly inserted
    // (existing deck_items are skipped), so card_reviews are only created once.
    const inserted = await tx
      .insert(deckItems)
      .values(visibleIds.map((vocabItemId) => ({ deckId: id, vocabItemId })))
      .onConflictDoNothing()
      .returning({ vocabItemId: deckItems.vocabItemId });
    const addedIds = inserted.map((r) => r.vocabItemId);
    if (addedIds.length) {
      await tx
        .insert(cardReviews)
        .values(buildNewCardReviews(id, addedIds, owner.deck.direction as DeckDirection))
        .onConflictDoNothing();
    }
    return addedIds;
  });

  return NextResponse.json({
    added: added.length,
    skipped: requested.length - added.length,
  });
}
