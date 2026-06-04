import { NextResponse } from 'next/server';
import { and, eq, lte, sql, asc } from 'drizzle-orm';
import { db } from '@/db';
import { cardReviews, vocabItems } from '@/db/schema';
import { apiUser } from '@/lib/api-auth';
import { requireDeckOwner } from '@/lib/decks';
import { storage } from '@/lib/storage';
import { glossesFor } from '@/lib/glosses';

/**
 * GET /api/decks/[id]/study — cards to study, ordered by due date.
 *  - ahead=false (default): only cards due now (dueAt <= now)
 *  - ahead=true: every card in the deck (study-ahead)
 * For 'both' decks, forward + reverse rows interleave naturally because we
 * order purely by dueAt.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
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

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get('limit') ?? '25', 10) || 25),
  );
  const ahead = url.searchParams.get('ahead') === 'true';

  const dueFilter = and(eq(cardReviews.deckId, id), lte(cardReviews.dueAt, sql`now()`));
  const modeFilter = ahead ? eq(cardReviews.deckId, id) : dueFilter;

  // dueCount is always the number of currently-due cards (drives the UI's
  // "nothing due" decision regardless of study-ahead mode).
  const [dueRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(cardReviews)
    .where(dueFilter);
  const dueCount = dueRow?.n ?? 0;

  const [totalRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(cardReviews)
    .where(modeFilter);
  const total = totalRow?.n ?? 0;

  const rows = await db
    .select({
      cardReviewId: cardReviews.id,
      direction: cardReviews.direction,
      state: cardReviews.state,
      dueAt: cardReviews.dueAt,
      reps: cardReviews.reps,
      lapses: cardReviews.lapses,
      vocabItemId: vocabItems.id,
      targetText: vocabItems.targetText,
      nativeText: vocabItems.nativeText,
      nativeLanguage: vocabItems.nativeLanguage,
      transliteration: vocabItems.transliteration,
      imageStorageKey: vocabItems.imageStorageKey,
    })
    .from(cardReviews)
    .innerJoin(vocabItems, eq(vocabItems.id, cardReviews.vocabItemId))
    .where(modeFilter)
    .orderBy(asc(cardReviews.dueAt))
    .limit(limit)
    .offset((page - 1) * limit);

  // C2: batch-resolve each card's native meaning into the user's base language
  // (one Google call per source language for the misses) so flashcards show a
  // gloss the learner can actually read. `nativeMachine` flags auto-translations.
  const glosses = await glossesFor(
    rows.map((r) => ({
      id: r.vocabItemId,
      nativeText: r.nativeText,
      nativeLanguage: r.nativeLanguage,
    })),
    user.baseLanguage,
  );

  const store = storage();
  const cards = rows.map((r) => {
    const g = glosses.get(r.vocabItemId);
    return {
      cardReviewId: r.cardReviewId,
      direction: r.direction,
      state: r.state,
      dueAt: r.dueAt,
      reps: r.reps,
      lapses: r.lapses,
      vocabItemId: r.vocabItemId,
      targetText: r.targetText,
      nativeText: g?.text ?? r.nativeText,
      nativeMachine: g?.machine ?? false,
      transliteration: r.transliteration,
      imageUrl: r.imageStorageKey ? store.publicUrl(r.imageStorageKey) : null,
    };
  });

  const hasMore = (page - 1) * limit + cards.length < total;

  return NextResponse.json({ cards, total, dueCount, page, limit, hasMore });
}
