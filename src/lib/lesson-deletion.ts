import { and, eq, inArray, ne, notExists, sql } from 'drizzle-orm';
import { db } from '@/db';
import { lessons, lessonFiles, lessonLinks, vocabItems, vocabLessons } from '@/db/schema';

/** Counts shown to the user before/after a lesson delete. */
export interface DeletionSummary {
  lessonName: string;
  /** Vocab in this lesson that also belong to another lesson — kept, association removed. */
  vocabReassignedCount: number;
  /** Vocab that belong ONLY to this lesson — permanently deleted. */
  vocabDeletedCount: number;
  pdfCount: number;
  audioCount: number;
  linkCount: number;
  /** Completed generated images among the deleted vocab items (also removed from storage). */
  imageCount: number;
}

/** The summary plus the internal sets needed to actually perform the deletion. */
export interface DeletionPlan extends DeletionSummary {
  vocabDeletedIds: string[];
  imageStorageKeys: string[];
  fileStorageKeys: string[];
}

/**
 * Compute what deleting `lessonId` would affect. Returns null when the lesson
 * doesn't exist or isn't owned by `userId`. Shared by the deletion-preview
 * endpoint (summary only) and the DELETE handler (full plan).
 */
export async function planLessonDeletion(
  userId: string,
  lessonId: string,
): Promise<DeletionPlan | null> {
  const [lesson] = await db
    .select({ id: lessons.id, name: lessons.name })
    .from(lessons)
    .where(and(eq(lessons.id, lessonId), eq(lessons.userId, userId)))
    .limit(1);
  if (!lesson) return null;

  // Vocab items in this lesson that have no OTHER lesson association.
  const onlyHere = await db
    .select({
      id: vocabItems.id,
      imageStorageKey: vocabItems.imageStorageKey,
      imageStatus: vocabItems.imageStatus,
    })
    .from(vocabItems)
    .where(
      and(
        inArray(
          vocabItems.id,
          db
            .select({ id: vocabLessons.vocabItemId })
            .from(vocabLessons)
            .where(eq(vocabLessons.lessonId, lessonId)),
        ),
        notExists(
          db
            .select({ one: sql`1` })
            .from(vocabLessons)
            .where(
              and(
                eq(vocabLessons.vocabItemId, vocabItems.id),
                ne(vocabLessons.lessonId, lessonId),
              ),
            ),
        ),
      ),
    );

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(vocabLessons)
    .where(eq(vocabLessons.lessonId, lessonId));

  const vocabDeletedCount = onlyHere.length;
  const vocabReassignedCount = (total ?? 0) - vocabDeletedCount;

  const imageStorageKeys = onlyHere
    .filter((v) => v.imageStatus === 'completed' && v.imageStorageKey)
    .map((v) => v.imageStorageKey as string);

  const files = await db
    .select({ kind: lessonFiles.kind, storageKey: lessonFiles.storageKey })
    .from(lessonFiles)
    .where(eq(lessonFiles.lessonId, lessonId));
  const pdfCount = files.filter((f) => f.kind === 'pdf').length;
  const audioCount = files.filter((f) => f.kind === 'audio').length;
  const fileStorageKeys = files.map((f) => f.storageKey);

  const [{ linkCount }] = await db
    .select({ linkCount: sql<number>`count(*)::int` })
    .from(lessonLinks)
    .where(eq(lessonLinks.lessonId, lessonId));

  return {
    lessonName: lesson.name,
    vocabReassignedCount,
    vocabDeletedCount,
    pdfCount,
    audioCount,
    linkCount: linkCount ?? 0,
    imageCount: imageStorageKeys.length,
    vocabDeletedIds: onlyHere.map((v) => v.id),
    imageStorageKeys,
    fileStorageKeys,
  };
}

/** Strip the internal-only fields, leaving the client-facing summary. */
export function toSummary(plan: DeletionPlan): DeletionSummary {
  const { vocabDeletedIds: _ids, imageStorageKeys: _ik, fileStorageKeys: _fk, ...summary } = plan;
  void _ids;
  void _ik;
  void _fk;
  return summary;
}
