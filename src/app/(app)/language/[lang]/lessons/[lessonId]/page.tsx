import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { lessons, vocabLessons } from '@/db/schema';
import { auth } from '@/lib/auth';
import { lessonsPath } from '@/lib/routes';
import { LessonDetailClient } from '@/components/lessons/lesson-detail-client';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ lang: string; lessonId: string }>;
}

export default async function LessonDetailPage({ params }: PageProps) {
  const { lang, lessonId } = await params;
  if (!UUID_RE.test(lessonId)) notFound();

  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) notFound();

  const [lesson] = await db
    .select()
    .from(lessons)
    .where(and(eq(lessons.id, lessonId), eq(lessons.userId, userId)))
    .limit(1);
  if (!lesson) notFound();

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(vocabLessons)
    .where(eq(vocabLessons.lessonId, lessonId));

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <Link
        href={lessonsPath(lang)}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to Lessons
      </Link>
      <LessonDetailClient
        lang={lang}
        lesson={{
          id: lesson.id,
          name: lesson.name,
          lessonNumber: lesson.lessonNumber,
          topic: lesson.topic,
          date: lesson.date,
        }}
        initialVocabCount={count ?? 0}
      />
    </div>
  );
}
