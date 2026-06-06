import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { vocabItems, vocabTags, vocabLessons, lessons, tags } from '@/db/schema';
import { apiUser } from '@/lib/api-auth';
import { vocabVisibleSql } from '@/lib/visibility';
import { planBulkEdit, intersectIds } from '@/lib/vocab-bulk';

const deltaSchema = z
  .object({
    add: z.array(z.string().uuid()).max(50).optional(),
    remove: z.array(z.string().uuid()).max(50).optional(),
  })
  .optional();

const bodySchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1).max(1000),
  tags: deltaSchema,
  lessons: deltaSchema,
});

/**
 * Bulk add/remove Tags & Lessons on already-persisted vocab items.
 *
 * Security boundary: ownership is enforced SERVER-SIDE per item — only items
 * the caller created are mutated (mirrors the single-item PATCH's
 * `createdBy === userId` rule). Items belonging to others are skipped and
 * counted, never silently mutated. Supplied tag/lesson ids are scoped to the
 * caller's own tags/lessons (these have no language column; each user studies a
 * single target language, so user-ownership is the available scoping and what
 * every existing write path uses) — cross-user/foreign ids are dropped.
 *
 * FSRS state and visibility/created_by are never touched here; only the
 * vocab_tags / vocab_lessons join tables change.
 */
export async function PATCH(req: Request) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }
  const itemIds = [...new Set(parsed.data.itemIds)];
  const tagAdd = parsed.data.tags?.add ?? [];
  const tagRemove = parsed.data.tags?.remove ?? [];
  const lessonAdd = parsed.data.lessons?.add ?? [];
  const lessonRemove = parsed.data.lessons?.remove ?? [];

  // Validate add-ids: keep only tags/lessons the caller owns. Defensively
  // rejects cross-user / cross-language ids before they reach the join tables.
  const ownedTagAdd = tagAdd.length
    ? intersectIds(
        tagAdd,
        (
          await db
            .select({ id: tags.id })
            .from(tags)
            .where(and(eq(tags.userId, user.id), inArray(tags.id, tagAdd)))
        ).map((r) => r.id),
      )
    : [];
  const ownedLessonAdd = lessonAdd.length
    ? intersectIds(
        lessonAdd,
        (
          await db
            .select({ id: lessons.id })
            .from(lessons)
            .where(and(eq(lessons.userId, user.id), inArray(lessons.id, lessonAdd)))
        ).map((r) => r.id),
      )
    : [];

  // Load the requested items the caller can see, with their author for the
  // editability partition. Items not visible at all simply don't load → skipped.
  const loaded = await db
    .select({ id: vocabItems.id, createdBy: vocabItems.createdBy })
    .from(vocabItems)
    .where(and(inArray(vocabItems.id, itemIds), vocabVisibleSql(user.id)));

  const plan = planBulkEdit({
    itemIds,
    items: loaded,
    userId: user.id,
    tagAdd: ownedTagAdd,
    tagRemove,
    lessonAdd: ownedLessonAdd,
    lessonRemove,
  });

  const hasWork =
    plan.editableIds.length > 0 &&
    (plan.tagInserts.length > 0 ||
      plan.lessonInserts.length > 0 ||
      tagRemove.length > 0 ||
      lessonRemove.length > 0);

  if (hasWork) {
    await db.transaction(async (tx) => {
      if (plan.tagInserts.length > 0) {
        await tx.insert(vocabTags).values(plan.tagInserts).onConflictDoNothing();
      }
      if (tagRemove.length > 0) {
        await tx
          .delete(vocabTags)
          .where(
            and(
              inArray(vocabTags.vocabItemId, plan.editableIds),
              inArray(vocabTags.tagId, tagRemove),
            ),
          );
      }
      if (plan.lessonInserts.length > 0) {
        await tx.insert(vocabLessons).values(plan.lessonInserts).onConflictDoNothing();
      }
      if (lessonRemove.length > 0) {
        await tx
          .delete(vocabLessons)
          .where(
            and(
              inArray(vocabLessons.vocabItemId, plan.editableIds),
              inArray(vocabLessons.lessonId, lessonRemove),
            ),
          );
      }
    });
  }

  return NextResponse.json({
    updated: plan.updated,
    skipped: plan.skipped,
    skippedIds: plan.skippedIds,
  });
}
