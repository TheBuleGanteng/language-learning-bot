import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { cardReviews, vocabComprehension } from '@/db/schema';
import { apiUser } from '@/lib/api-auth';
import { requireDeckOwner } from '@/lib/decks';
import { dbRowToCard, scheduleCard, cardToDbRow, Rating } from '@/lib/fsrs';
import { comprehensionFromStability } from '@/lib/comprehension';

// Body rating values match the ts-fsrs Rating enum: 1=Again, 2=Hard, 3=Good, 4=Easy.
const rateSchema = z.object({
  cardReviewId: z.string().uuid(),
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
});

// POST /api/decks/[id]/rate — apply an FSRS rating to one card and persist the
// updated schedule.
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
  const parsed = rateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  const [row] = await db
    .select()
    .from(cardReviews)
    .where(and(eq(cardReviews.id, parsed.data.cardReviewId), eq(cardReviews.deckId, id)))
    .limit(1);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const card = dbRowToCard(row);
  const updatedCard = scheduleCard(card, parsed.data.rating as Rating, new Date());
  const next = cardToDbRow(updatedCard);

  const [updated] = await db
    .update(cardReviews)
    .set(next)
    .where(eq(cardReviews.id, row.id))
    .returning();

  // Recompute this user's comprehension for the reviewed word from the fresh
  // FSRS stability and upsert it — the review overwrites any prior manual value
  // (the chosen behavior). Stability only changes on review, so it's stable
  // between sessions. Best-effort: never fail the rating on a recompute error.
  try {
    const level = comprehensionFromStability(updated.stability, updated.reps);
    await db
      .insert(vocabComprehension)
      .values({ userId: user.id, vocabItemId: updated.vocabItemId, level })
      .onConflictDoUpdate({
        target: [vocabComprehension.userId, vocabComprehension.vocabItemId],
        set: { level, updatedAt: sql`now()` },
      });
  } catch {
    // non-critical
  }

  return NextResponse.json(updated);
}
