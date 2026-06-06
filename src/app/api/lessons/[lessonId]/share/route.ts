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

// Granular lesson sharing. Shareable material categories: vocabulary
// (vocab_items), notes (lesson_files kind='pdf'), photos/images (lesson_files
// kind='image'), audio (lesson_files kind='audio'), and links (lesson_links).
const shareSchema = z.object({
  vocabulary: z.boolean(),
  notes: z.boolean(),
  images: z.boolean(),
  audio: z.boolean(),
  links: z.boolean(),
  // Item 4–7 link collections. Optional so a stale client doesn't 400 during the
  // deploy window; absent → treated as not-shared.
  dls_audio: z.boolean().optional(),
  quizlet: z.boolean().optional(),
  dls_exercises: z.boolean().optional(),
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
    .select({ visibility: lessonLinks.visibility, category: lessonLinks.category })
    .from(lessonLinks)
    .where(and(eq(lessonLinks.lessonId, lessonId), eq(lessonLinks.userId, user.id)));
  const byCat = (cat: string) => linkRows.filter((l) => l.category === cat);

  return NextResponse.json({
    lessonVisibility: lrow.visibility,
    categories: {
      vocabulary: countShared(vocabRows),
      notes: countShared(fileRows.filter((f) => f.kind === 'pdf')),
      images: countShared(fileRows.filter((f) => f.kind === 'image')),
      audio: countShared(fileRows.filter((f) => f.kind === 'audio')),
      links: countShared(byCat('general')),
      dls_audio: countShared(byCat('dls_audio')),
      quizlet: countShared(byCat('quizlet')),
      dls_exercises: countShared(byCat('dls_exercises')),
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
  const { vocabulary, notes, images, audio, links } = parsed.data;
  const dlsAudio = parsed.data.dls_audio ?? false;
  const quizlet = parsed.data.quizlet ?? false;
  const dlsExercises = parsed.data.dls_exercises ?? false;

  const lrow = await loadOwnedLesson(lessonId);
  if (!lrow) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (lrow.createdBy !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const lessonVisibility: 'shared' | 'private' =
    vocabulary || notes || images || audio || links || dlsAudio || quizlet || dlsExercises
      ? 'shared'
      : 'private';
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
      .set({ visibility: vis(images) })
      .where(
        and(
          eq(lessonFiles.lessonId, lessonId),
          eq(lessonFiles.userId, user.id),
          eq(lessonFiles.kind, 'image'),
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

    // Links — scoped per collection so toggling "Links" (general) doesn't flip
    // the DLS / Quizlet sections, and vice versa.
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
            eq(lessonLinks.userId, user.id),
            eq(lessonLinks.category, cat),
          ),
        );
    await setLinkVis('general', links);
    await setLinkVis('dls_audio', dlsAudio);
    await setLinkVis('quizlet', quizlet);
    await setLinkVis('dls_exercises', dlsExercises);

    return updatedLesson;
  });

  return NextResponse.json({ lesson });
}
