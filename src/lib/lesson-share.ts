import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import {
  lessons,
  vocabItems,
  vocabLessons,
  vocabTags,
  tags,
  lessonFiles,
  lessonLinks,
} from '@/db/schema';

// Shared per-lesson granular-sharing logic, used by BOTH the single-lesson share
// endpoint and the bulk-share endpoint (Part 5.1) so the rules live in one place.

export const shareConfigSchema = z.object({
  vocabulary: z.boolean(),
  notes: z.boolean(),
  images: z.boolean(),
  audio: z.boolean(),
  links: z.boolean(),
  // Item 4–7 link collections. Optional so a stale client doesn't 400.
  dls_audio: z.boolean().optional(),
  quizlet: z.boolean().optional(),
  dls_exercises: z.boolean().optional(),
});
export type ShareConfig = z.infer<typeof shareConfigSchema>;

/**
 * Split requested ids into those the caller owns (to act on) and those they
 * don't (to skip + count). Creator-gating for the bulk lesson endpoints
 * (share + delete) lives here so the skip/count behavior is unit-testable.
 */
export function splitOwnership(
  requested: string[],
  owned: string[],
): { updatedIds: string[]; skippedIds: string[] } {
  const ownedSet = new Set(owned);
  const uniq = [...new Set(requested)];
  return {
    updatedIds: uniq.filter((id) => ownedSet.has(id)),
    skippedIds: uniq.filter((id) => !ownedSet.has(id)),
  };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Apply a granular sharing config to ONE lesson and its contents, for the
 * caller's OWN items only. Ticked → 'shared', unticked → 'private'. The lesson
 * goes 'shared' if any category is ticked, else 'private'. Sharing vocab also
 * auto-shares its tags (tags are never auto-unshared). Returns the updated
 * lesson row. Runs inside the caller-provided transaction.
 */
export async function applyLessonShare(
  tx: Tx,
  userId: string,
  lessonId: string,
  config: ShareConfig,
) {
  const { vocabulary, notes, images, audio, links } = config;
  const dlsAudio = config.dls_audio ?? false;
  const quizlet = config.quizlet ?? false;
  const dlsExercises = config.dls_exercises ?? false;

  const lessonVisibility: 'shared' | 'private' =
    vocabulary || notes || images || audio || links || dlsAudio || quizlet || dlsExercises
      ? 'shared'
      : 'private';
  const vis = (on: boolean): 'shared' | 'private' => (on ? 'shared' : 'private');

  const [updatedLesson] = await tx
    .update(lessons)
    .set({ visibility: lessonVisibility })
    .where(eq(lessons.id, lessonId))
    .returning();

  // Vocabulary — only the caller's own items in this lesson.
  const ownVocab = await tx
    .select({ id: vocabItems.id })
    .from(vocabItems)
    .innerJoin(vocabLessons, eq(vocabLessons.vocabItemId, vocabItems.id))
    .where(and(eq(vocabLessons.lessonId, lessonId), eq(vocabItems.createdBy, userId)));
  const vocabIds = ownVocab.map((v) => v.id);
  if (vocabIds.length) {
    await tx
      .update(vocabItems)
      .set({ visibility: vis(vocabulary), updatedAt: new Date() })
      .where(inArray(vocabItems.id, vocabIds));
    // Tags are only ever auto-shared, never auto-unshared.
    if (vocabulary) {
      const tagRows = await tx
        .select({ tagId: vocabTags.tagId })
        .from(vocabTags)
        .where(inArray(vocabTags.vocabItemId, vocabIds));
      const tagIds = [...new Set(tagRows.map((tr) => tr.tagId))];
      if (tagIds.length) {
        await tx
          .update(tags)
          .set({ visibility: 'shared' })
          .where(and(eq(tags.createdBy, userId), inArray(tags.id, tagIds)));
      }
    }
  }

  // Notes (pdf) + Images + Audio — lesson_files of the caller, by kind.
  await tx
    .update(lessonFiles)
    .set({ visibility: vis(notes) })
    .where(
      and(eq(lessonFiles.lessonId, lessonId), eq(lessonFiles.userId, userId), eq(lessonFiles.kind, 'pdf')),
    );
  await tx
    .update(lessonFiles)
    .set({ visibility: vis(images) })
    .where(
      and(eq(lessonFiles.lessonId, lessonId), eq(lessonFiles.userId, userId), eq(lessonFiles.kind, 'image')),
    );
  await tx
    .update(lessonFiles)
    .set({ visibility: vis(audio) })
    .where(
      and(eq(lessonFiles.lessonId, lessonId), eq(lessonFiles.userId, userId), eq(lessonFiles.kind, 'audio')),
    );

  // Links — scoped per collection so toggling one section doesn't flip another.
  const setLinkVis = (
    cat: 'general' | 'dls_audio' | 'quizlet' | 'dls_exercises',
    on: boolean,
  ) =>
    tx
      .update(lessonLinks)
      .set({ visibility: vis(on) })
      .where(
        and(
          eq(lessonLinks.lessonId, lessonId),
          eq(lessonLinks.userId, userId),
          eq(lessonLinks.category, cat),
        ),
      );
  await setLinkVis('general', links);
  await setLinkVis('dls_audio', dlsAudio);
  await setLinkVis('quizlet', quizlet);
  await setLinkVis('dls_exercises', dlsExercises);

  return updatedLesson;
}
