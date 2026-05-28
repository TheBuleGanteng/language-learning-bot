import Link from 'next/link';
import { lessonPath } from '@/lib/routes';

interface Props {
  params: Promise<{ lang: string; lessonId: string }>;
}

export default async function FlashcardsStubPage({ params }: Props) {
  const { lang, lessonId } = await params;
  return (
    <div className="max-w-2xl mx-auto py-16 text-center space-y-4">
      <h1 className="text-3xl font-bold">Flashcards — coming soon</h1>
      <p className="text-muted-foreground">
        Spaced-repetition flashcards using FSRS will let you review this lesson&apos;s
        vocabulary efficiently.
      </p>
      <Link
        href={lessonPath(lang, lessonId)}
        className="inline-block text-sm text-muted-foreground hover:text-foreground underline"
      >
        ← Back to Lesson
      </Link>
    </div>
  );
}
