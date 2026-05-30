import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { decks, deckItems, cardReviews } from '@/db/schema';
import { apiUser } from '@/lib/api-auth';
import { requireDeckOwner, cardSidesFor, buildNewCardReviews, type CardSide } from '@/lib/decks';

const patchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  direction: z.enum(['forward', 'reverse', 'both']).optional(),
});

// PATCH /api/decks/[id]/settings — rename and/or change direction. When the
// direction changes, card_reviews rows are created for newly-added faces and
// deleted for removed faces.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
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
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }
  const d = parsed.data;
  const deck = owner.deck;

  await db.transaction(async (tx) => {
    if (d.direction && d.direction !== deck.direction) {
      const current = new Set(cardSidesFor(deck.direction as 'forward' | 'reverse' | 'both'));
      const next = new Set(cardSidesFor(d.direction));
      const toAdd = [...next].filter((s) => !current.has(s)) as CardSide[];
      const toRemove = [...current].filter((s) => !next.has(s)) as CardSide[];

      if (toRemove.length) {
        await tx
          .delete(cardReviews)
          .where(and(eq(cardReviews.deckId, id), inArray(cardReviews.direction, toRemove)));
      }
      if (toAdd.length) {
        const items = await tx
          .select({ vocabItemId: deckItems.vocabItemId })
          .from(deckItems)
          .where(eq(deckItems.deckId, id));
        const vocabItemIds = items.map((i) => i.vocabItemId);
        for (const side of toAdd) {
          if (vocabItemIds.length) {
            // buildNewCardReviews with a single-side direction yields that side.
            await tx
              .insert(cardReviews)
              .values(buildNewCardReviews(id, vocabItemIds, side))
              .onConflictDoNothing();
          }
        }
      }
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (d.name !== undefined) updates.name = d.name;
    if (d.direction !== undefined) updates.direction = d.direction;
    await tx.update(decks).set(updates).where(eq(decks.id, id));
  });

  const [updated] = await db.select().from(decks).where(eq(decks.id, id)).limit(1);
  return NextResponse.json(updated);
}
