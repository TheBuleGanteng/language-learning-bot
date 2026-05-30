import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { lessons, vocabItems, vocabLessons } from '@/db/schema';
import { auth } from '@/lib/auth';
import { storage } from '@/lib/storage';
import { planLessonDeletion, toSummary } from '@/lib/lesson-deletion';
import { lessonVisibleSql } from '@/lib/visibility';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns the lesson's creator id, or undefined if the lesson doesn't exist. */
async function getLessonCreator(lessonId: string): Promise<string | null | undefined> {
  const [row] = await db
    .select({ createdBy: lessons.createdBy })
    .from(lessons)
    .where(eq(lessons.id, lessonId))
    .limit(1);
  return row ? row.createdBy : undefined;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ lessonId: string }> },
) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { lessonId } = await ctx.params;
  if (!UUID_RE.test(lessonId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const [row] = await db
    .select()
    .from(lessons)
    .where(and(eq(lessons.id, lessonId), lessonVisibleSql(userId)))
    .limit(1);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(vocabLessons)
    .where(eq(vocabLessons.lessonId, lessonId));

  return NextResponse.json({ ...row, vocabCount: count ?? 0 });
}

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  topic: z.string().max(2000).nullable().optional(),
  date: z.string().nullable().optional(),
  lessonNumber: z.number().int().nullable().optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ lessonId: string }> },
) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { lessonId } = await ctx.params;
  if (!UUID_RE.test(lessonId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  // Ownership guard (§3b): only the creator may edit.
  const creator = await getLessonCreator(lessonId);
  if (creator === undefined) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (creator !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const d = parsed.data;
  const updates: Record<string, unknown> = {};
  if (d.name !== undefined) updates.name = d.name;
  if (d.topic !== undefined) updates.topic = d.topic;
  if (d.date !== undefined) updates.date = d.date;
  if (d.lessonNumber !== undefined) updates.lessonNumber = d.lessonNumber;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true });
  }

  await db.update(lessons).set(updates).where(eq(lessons.id, lessonId));
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ lessonId: string }> },
) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { lessonId } = await ctx.params;
  if (!UUID_RE.test(lessonId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const plan = await planLessonDeletion(userId, lessonId);
  if (!plan) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // DB is the source of truth. Delete vocab-only items first (cascades vocab_tags,
  // vocab_lessons, item_performance; image_generation_log.vocab_item_id is set null),
  // then the lesson row (cascades lesson_files, lesson_links, and the remaining
  // vocab_lessons join rows — removing this lesson's association from shared vocab).
  await db.transaction(async (tx) => {
    if (plan.vocabDeletedIds.length > 0) {
      await tx.delete(vocabItems).where(inArray(vocabItems.id, plan.vocabDeletedIds));
    }
    await tx
      .delete(lessons)
      .where(and(eq(lessons.id, lessonId), eq(lessons.userId, userId)));
  });

  // After commit: best-effort storage cleanup. Orphaned files are recoverable
  // via a later cleanup script, so a storage failure must not fail the request.
  const store = storage();
  const keys = [...plan.fileStorageKeys, ...plan.imageStorageKeys];
  await Promise.all(
    keys.map(async (key) => {
      try {
        await store.delete(key);
      } catch (err) {
        console.error(`Failed to delete storage key during lesson delete: ${key}`, err);
      }
    }),
  );

  return NextResponse.json(toSummary(plan));
}
