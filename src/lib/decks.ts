import { eq, and } from 'drizzle-orm';
import { db } from '@/db';
import { decks, type Deck, type NewCardReview } from '@/db/schema';
import { createNewCard, cardToDbRow } from '@/lib/fsrs';

export type DeckDirection = 'forward' | 'reverse' | 'both';
export type CardSide = 'forward' | 'reverse';

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The card faces a deck of the given direction produces. */
export function cardSidesFor(direction: DeckDirection): CardSide[] {
  if (direction === 'both') return ['forward', 'reverse'];
  return [direction];
}

/**
 * Build fresh card_reviews insert rows for the given vocab items and deck
 * direction. A 'both' deck yields one forward + one reverse row per item.
 */
export function buildNewCardReviews(
  deckId: string,
  vocabItemIds: string[],
  direction: DeckDirection,
): NewCardReview[] {
  const sides = cardSidesFor(direction);
  const rows: NewCardReview[] = [];
  for (const vocabItemId of vocabItemIds) {
    for (const side of sides) {
      const c = cardToDbRow(createNewCard());
      rows.push({
        deckId,
        vocabItemId,
        direction: side,
        stability: c.stability,
        difficulty: c.difficulty,
        elapsedDays: c.elapsedDays,
        scheduledDays: c.scheduledDays,
        reps: c.reps,
        lapses: c.lapses,
        state: c.state,
        dueAt: c.dueAt,
        lastReviewedAt: c.lastReviewedAt,
      });
    }
  }
  return rows;
}

export type DeckOwnerResult =
  | { ok: true; deck: Deck }
  | { ok: false; status: 404 | 403 };

/**
 * Loads a deck and verifies the caller owns it. Returns a discriminated result
 * so handlers can map to 404 (missing) / 403 (not owner) without leaking
 * existence.
 */
export async function requireDeckOwner(
  deckId: string,
  userId: string,
): Promise<DeckOwnerResult> {
  if (!UUID_RE.test(deckId)) return { ok: false, status: 404 };
  const [deck] = await db.select().from(decks).where(eq(decks.id, deckId)).limit(1);
  if (!deck) return { ok: false, status: 404 };
  if (deck.userId !== userId) return { ok: false, status: 403 };
  return { ok: true, deck };
}

/** Convenience: owned deck filter for direct queries. */
export function ownedDeck(deckId: string, userId: string) {
  return and(eq(decks.id, deckId), eq(decks.userId, userId));
}
