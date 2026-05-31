export function vocabPath(lang: string, sub?: string) {
  return `/language/${lang}/vocab${sub ?? ''}`;
}

export function lessonsPath(lang: string) {
  return `/language/${lang}/lessons`;
}

export function lessonPath(lang: string, lessonId: string) {
  return `/language/${lang}/lessons/${lessonId}`;
}

export function flashcardsPath(lang: string, lessonId: string) {
  return `/language/${lang}/lessons/${lessonId}/practice/flashcards`;
}

// Feature B/C: standalone flashcard decks (distinct from the per-lesson
// practice flashcards above). Feature C moved these under /decks/.
export function decksPath(lang: string) {
  return `/language/${lang}/decks`;
}

// Mode-chooser hub for a single deck.
export function deckHubPath(lang: string, deckId: string) {
  return `/language/${lang}/decks/${deckId}`;
}

// Spaced-repetition flashcard study session for a deck.
export function deckFlashcardsPath(lang: string, deckId: string) {
  return `/language/${lang}/decks/${deckId}/flashcards`;
}

// Kruu Bingo avatar practice session for a deck.
export function deckAvatarPath(lang: string, deckId: string) {
  return `/language/${lang}/decks/${deckId}/avatar`;
}

export function chatPath(lang: string, lessonId: string) {
  return `/language/${lang}/lessons/${lessonId}/practice/chat`;
}
