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

export function chatPath(lang: string, lessonId: string) {
  return `/language/${lang}/lessons/${lessonId}/practice/chat`;
}
