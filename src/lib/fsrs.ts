import {
  createEmptyCard,
  fsrs,
  Rating,
  State,
  type Card,
  type Grade,
  type StateType,
} from 'ts-fsrs';

export { Rating, State };
export type { Card };

// A single shared scheduler instance with default FSRS parameters.
const scheduler = fsrs();

/** Initialize a brand-new card (state 'New', due now). */
export function createNewCard(): Card {
  return createEmptyCard();
}

/** Returns the updated card state after applying a rating at time `now`. */
export function scheduleCard(card: Card, rating: Rating, now: Date): Card {
  // `next` only accepts gradable ratings (excludes Rating.Manual); our callers
  // only ever pass Again/Hard/Good/Easy.
  const result = scheduler.next(card, now, rating as Grade);
  return result.card;
}

// ts-fsrs `Card.state` is the numeric `State` enum (New=0, Learning=1, …) but
// we persist the human-readable name ('New', 'Learning', …) in the
// card_reviews.state varchar. These two helpers bridge that gap.
function stateNameToEnum(name: string): State {
  switch (name) {
    case 'Learning':
      return State.Learning;
    case 'Review':
      return State.Review;
    case 'Relearning':
      return State.Relearning;
    default:
      return State.New;
  }
}

function stateEnumToName(state: State): StateType {
  return (State[state] as StateType) ?? 'New';
}

/** Shape of the card_reviews columns this module reads from. */
export interface CardReviewRow {
  stability: number | null;
  difficulty: number | null;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: string;
  dueAt: Date;
  lastReviewedAt: Date | null;
}

/** Convert a card_reviews DB row to a ts-fsrs Card object. */
export function dbRowToCard(row: CardReviewRow): Card {
  return {
    stability: row.stability ?? 0,
    difficulty: row.difficulty ?? 0,
    elapsed_days: row.elapsedDays,
    scheduled_days: row.scheduledDays,
    reps: row.reps,
    lapses: row.lapses,
    // ts-fsrs ≥5 tracks the current learning step on the card. The Feature B
    // schema does not persist it, so it resets to 0 on each load — acceptable
    // for vocab review (only affects intra-learning-step granularity).
    learning_steps: 0,
    state: stateNameToEnum(row.state),
    due: row.dueAt,
    last_review: row.lastReviewedAt ?? undefined,
  };
}

/** Convert a scheduled ts-fsrs Card back to card_reviews column values. */
export function cardToDbRow(card: Card) {
  return {
    stability: card.stability,
    difficulty: card.difficulty,
    // elapsed/scheduled columns are integers; FSRS may emit fractional
    // short-term values, so round. They are informational — the scheduler
    // recomputes elapsed time from due/last_review on the next review.
    elapsedDays: Math.round(card.elapsed_days),
    scheduledDays: Math.round(card.scheduled_days),
    reps: card.reps,
    lapses: card.lapses,
    state: stateEnumToName(card.state),
    dueAt: card.due,
    lastReviewedAt: card.last_review ?? null,
    updatedAt: new Date(),
  };
}
