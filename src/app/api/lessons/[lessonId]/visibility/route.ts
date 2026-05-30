import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { lessons, vocabItems, vocabLessons, vocabTags, tags } from '@/db/schema';
import { apiUser } from '@/lib/api-auth';
import { canShare } from '@/lib/roles';

const schema = z.object({
  visibility: z.enum(['shared', 'private']),
  cascade: z.boolean(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ lessonId: string }> },
) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canShare(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { lessonId } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }
  const { visibility, cascade } = parsed.data;

  const [lrow] = await db
    .select({ createdBy: lessons.createdBy })
    .from(lessons)
    .where(eq(lessons.id, lessonId))
    .limit(1);
  if (!lrow) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (lrow.createdBy !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let affectedVocabCount = 0;
  let affectedTagCount = 0;

  const lesson = await db.transaction(async (tx) => {
    const [updatedLesson] = await tx
      .update(lessons)
      .set({ visibility })
      .where(eq(lessons.id, lessonId))
      .returning();

    if (cascade) {
      // Only the caller's own vocab in this lesson is affected.
      const ownVocab = await tx
        .select({ id: vocabItems.id })
        .from(vocabItems)
        .innerJoin(vocabLessons, eq(vocabLessons.vocabItemId, vocabItems.id))
        .where(and(eq(vocabLessons.lessonId, lessonId), eq(vocabItems.createdBy, user.id)));
      const vocabIds = ownVocab.map((v) => v.id);

      if (vocabIds.length) {
        await tx
          .update(vocabItems)
          .set({ visibility, updatedAt: new Date() })
          .where(inArray(vocabItems.id, vocabIds));
        affectedVocabCount = vocabIds.length;

        // Tags are only ever auto-SHARED, never auto-unshared (design decision).
        if (visibility === 'shared') {
          const tagRows = await tx
            .select({ tagId: vocabTags.tagId })
            .from(vocabTags)
            .where(inArray(vocabTags.vocabItemId, vocabIds));
          const tagIds = [...new Set(tagRows.map((t) => t.tagId))];
          if (tagIds.length) {
            const updatedTags = await tx
              .update(tags)
              .set({ visibility: 'shared' })
              .where(and(eq(tags.createdBy, user.id), inArray(tags.id, tagIds)))
              .returning({ id: tags.id });
            affectedTagCount = updatedTags.length;
          }
        }
      }
    }

    return updatedLesson;
  });

  return NextResponse.json({ lesson, affectedVocabCount, affectedTagCount });
}
