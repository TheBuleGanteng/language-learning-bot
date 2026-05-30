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

// Feature B: standalone flashcard decks (distinct from the per-lesson practice
// flashcards above).
export function decksPath(lang: string) {
  return `/language/${lang}/flashcards`;
}

export function deckStudyPath(lang: string, deckId: string) {
  return `/language/${lang}/flashcards/${deckId}/study`;
}

export function chatPath(lang: string, lessonId: string) {
  return `/language/${lang}/lessons/${lessonId}/practice/chat`;
}
