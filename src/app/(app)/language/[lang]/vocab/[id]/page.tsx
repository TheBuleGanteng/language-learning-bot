import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { vocabItems, vocabLessons, vocabTags, lessons, tags } from '@/db/schema';
import { auth } from '@/lib/auth';
import { VocabForm } from '@/components/vocab/vocab-form';
import { VocabImageControls } from '@/components/vocab/vocab-image-controls';
import { storage } from '@/lib/storage';

export default async function EditVocabPage({
  params,
}: {
  params: Promise<{ id: string; lang: string }>;
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
    .select({ id: lessons.id, name: lessons.name })
    .from(vocabLessons)
    .innerJoin(lessons, eq(lessons.id, vocabLessons.lessonId))
    .where(eq(vocabLessons.vocabItemId, id));
  const itemTags = await db
    .select({ id: tags.id, name: tags.name })
    .from(vocabTags)
    .innerJoin(tags, eq(tags.id, vocabTags.tagId))
    .where(eq(vocabTags.vocabItemId, id));

  const imageUrl = item.imageStorageKey
    ? await storage().getUrl(item.imageStorageKey)
    : null;
  const imageStatus = item.imageStatus as
    | 'none'
    | 'generating'
    | 'completed'
    | 'refused'
    | 'failed';

  return (
    <div className="space-y-6">
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
          lessons: itemLessons,
          tags: itemTags,
        }}
      />
      <VocabImageControls
        vocabId={item.id}
        initialImageUrl={imageUrl}
        initialStatus={imageStatus}
        initialOverride={item.imagePromptOverride}
      />
    </div>
  );
}
