import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { lessons, vocabItems, vocabLessons, lessonFiles, lessonLinks } from '@/db/schema';
import { apiUser } from '@/lib/api-auth';
import { canShare } from '@/lib/roles';
import { applyLessonShare, shareConfigSchema } from '@/lib/lesson-share';

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
  const parsed = shareConfigSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const lrow = await loadOwnedLesson(lessonId);
  if (!lrow) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (lrow.createdBy !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const lesson = await db.transaction((tx) =>
    applyLessonShare(tx, user.id, lessonId, parsed.data),
  );

  return NextResponse.json({ lesson });
}
