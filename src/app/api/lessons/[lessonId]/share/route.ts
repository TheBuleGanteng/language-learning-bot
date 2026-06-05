import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
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
import { apiUser } from '@/lib/api-auth';
import { canShare } from '@/lib/roles';

// Granular lesson sharing (PART 1). The shareable material categories that
// actually exist on a lesson are: vocabulary (vocab_items), notes
// (lesson_files kind='pdf'), audio (lesson_files kind='audio'), and links
// (lesson_links). lesson_files has no "images" category — vocab-item images
// travel with the Vocabulary category — so there is no separate Images flag.
const shareSchema = z.object({
  vocabulary: z.boolean(),
  notes: z.boolean(),
  audio: z.boolean(),
  links: z.boolean(),
});

type CategoryCount = { total: number; shared: number };

function countShared(rows: { visibility: string }[]): CategoryCount {
  return {
    total: rows.length,
    shared: rows.filter((r) => r.visibility === 'shared').length,
  };
}

/** Loads a lesson's createdBy + visibility (caller asserts creator separately). */
async function loadOwnedLesson(lessonId: string) {
  const [lrow] = await db
    .select({ createdBy: lessons.createdBy, visibility: lessons.visibility })
    .from(lessons)
    .where(eq(lessons.id, lessonId))
    .limit(1);
  return lrow ?? null;
}

// GET → current per-category sharing status for the caller's own materials, so
// the popup can reflect what's already shared.
export async function GET(req: Request, ctx: { params: Promise<{ lessonId: string }> }) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canShare(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { lessonId } = await ctx.params;

  const lrow = await loadOwnedLesson(lessonId);
  if (!lrow) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (lrow.createdBy !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const vocabRows = await db
    .select({ visibility: vocabItems.visibility })
    .from(vocabItems)
    .innerJoin(vocabLessons, eq(vocabLessons.vocabItemId, vocabItems.id))
    .where(and(eq(vocabLessons.lessonId, lessonId), eq(vocabItems.createdBy, user.id)));

  const fileRows = await db
    .select({ kind: lessonFiles.kind, visibility: lessonFiles.visibility })
    .from(lessonFiles)
    .where(and(eq(lessonFiles.lessonId, lessonId), eq(lessonFiles.userId, user.id)));

  const linkRows = await db
    .select({ visibility: lessonLinks.visibility })
    .from(lessonLinks)
    .where(and(eq(lessonLinks.lessonId, lessonId), eq(lessonLinks.userId, user.id)));

  return NextResponse.json({
    lessonVisibility: lrow.visibility,
    categories: {
      vocabulary: countShared(vocabRows),
      notes: countShared(fileRows.filter((f) => f.kind === 'pdf')),
      audio: countShared(fileRows.filter((f) => f.kind === 'audio')),
      links: countShared(linkRows),
    },
  });
}

// PATCH → apply the ticked categories. Ticked → 'shared', unticked → 'private',
// for the caller's own items only. The lesson goes 'shared' if any category is
// ticked, else 'private'. Sharing vocab also auto-shares its tags (never
// auto-unshares).
export async function PATCH(req: Request, ctx: { params: Promise<{ lessonId: string }> }) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canShare(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { lessonId } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = shareSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  const { vocabulary, notes, audio, links } = parsed.data;

  const lrow = await loadOwnedLesson(lessonId);
  if (!lrow) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (lrow.createdBy !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const lessonVisibility: 'shared' | 'private' =
    vocabulary || notes || audio || links ? 'shared' : 'private';
  const vis = (on: boolean): 'shared' | 'private' => (on ? 'shared' : 'private');

  const lesson = await db.transaction(async (tx) => {
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
      .where(and(eq(vocabLessons.lessonId, lessonId), eq(vocabItems.createdBy, user.id)));
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
        const tagIds = [...new Set(tagRows.map((t) => t.tagId))];
        if (tagIds.length) {
          await tx
            .update(tags)
            .set({ visibility: 'shared' })
            .where(and(eq(tags.createdBy, user.id), inArray(tags.id, tagIds)));
        }
      }
    }

    // Notes (pdf) + Audio — lesson_files of the caller, by kind.
    await tx
      .update(lessonFiles)
      .set({ visibility: vis(notes) })
      .where(
        and(
          eq(lessonFiles.lessonId, lessonId),
          eq(lessonFiles.userId, user.id),
          eq(lessonFiles.kind, 'pdf'),
        ),
      );
    await tx
      .update(lessonFiles)
      .set({ visibility: vis(audio) })
      .where(
        and(
          eq(lessonFiles.lessonId, lessonId),
          eq(lessonFiles.userId, user.id),
          eq(lessonFiles.kind, 'audio'),
        ),
      );

    // Links.
    await tx
      .update(lessonLinks)
      .set({ visibility: vis(links) })
      .where(and(eq(lessonLinks.lessonId, lessonId), eq(lessonLinks.userId, user.id)));

    return updatedLesson;
  });

  return NextResponse.json({ lesson });
}
