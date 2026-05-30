import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { lessons, vocabItems, vocabLessons, vocabTags, tags } from '@/db/schema';
import { apiUser } from '@/lib/api-auth';
import { canShare } from '@/lib/roles';

const schema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(1000),
  visibility: z.enum(['shared', 'private']),
  cascade: z.boolean(),
});

export async function PATCH(req: Request) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canShare(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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
  const ids = [...new Set(parsed.data.ids)];

  // Only the caller's own lessons are affected.
  const ownedLessons = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(and(inArray(lessons.id, ids), eq(lessons.createdBy, user.id)));
  const ownedIds = ownedLessons.map((l) => l.id);

  let affectedVocabCount = 0;
  let affectedTagCount = 0;

  if (ownedIds.length) {
    await db.transaction(async (tx) => {
      await tx.update(lessons).set({ visibility }).where(inArray(lessons.id, ownedIds));

      if (cascade) {
        const ownVocab = await tx
          .select({ id: vocabItems.id })
          .from(vocabItems)
          .innerJoin(vocabLessons, eq(vocabLessons.vocabItemId, vocabItems.id))
          .where(and(inArray(vocabLessons.lessonId, ownedIds), eq(vocabItems.createdBy, user.id)));
        const vocabIds = [...new Set(ownVocab.map((v) => v.id))];

        if (vocabIds.length) {
          await tx
            .update(vocabItems)
            .set({ visibility, updatedAt: new Date() })
            .where(inArray(vocabItems.id, vocabIds));
          affectedVocabCount = vocabIds.length;

          // Tags only auto-share, never auto-unshare.
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
    });
  }

  return NextResponse.json({
    updated: ownedIds.length,
    skipped: ids.length - ownedIds.length,
    affectedVocabCount,
    affectedTagCount,
  });
}
