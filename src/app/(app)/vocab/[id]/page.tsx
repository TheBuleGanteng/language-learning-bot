import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { vocabItems, vocabLessons, vocabTags, lessons, tags } from '@/db/schema';
import { auth } from '@/lib/auth';
import { VocabForm } from '@/components/vocab/vocab-form';

export default async function EditVocabPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) notFound();

  const [item] = await db
    .select()
    .from(vocabItems)
    .where(and(eq(vocabItems.id, id), eq(vocabItems.userId, userId)))
    .limit(1);
  if (!item) notFound();

  const itemLessons = await db
    .select({ name: lessons.name })
    .from(vocabLessons)
    .innerJoin(lessons, eq(lessons.id, vocabLessons.lessonId))
    .where(eq(vocabLessons.vocabItemId, id));
  const itemTags = await db
    .select({ name: tags.name })
    .from(vocabTags)
    .innerJoin(tags, eq(tags.id, vocabTags.tagId))
    .where(eq(vocabTags.vocabItemId, id));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Edit vocab</h1>
      <VocabForm
        mode="edit"
        initial={{
          id: item.id,
          targetText: item.targetText,
          nativeText: item.nativeText,
          transliteration: item.transliteration ?? '',
          pos: item.pos ?? '',
          exampleTarget: item.exampleTarget ?? '',
          exampleNative: item.exampleNative ?? '',
          notes: item.notes ?? '',
          lessonName: itemLessons[0]?.name ?? '',
          tagNames: itemTags.map((t) => t.name).join(', '),
        }}
      />
    </div>
  );
}
