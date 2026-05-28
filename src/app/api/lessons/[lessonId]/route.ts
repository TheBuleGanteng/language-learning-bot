import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { lessons, vocabLessons } from '@/db/schema';
import { auth } from '@/lib/auth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireUserOwnsLesson(userId: string, lessonId: string) {
  const [row] = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(and(eq(lessons.id, lessonId), eq(lessons.userId, userId)))
    .limit(1);
  return !!row;
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
    .where(and(eq(lessons.id, lessonId), eq(lessons.userId, userId)))
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
  if (!(await requireUserOwnsLesson(userId, lessonId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
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
  const result = await db
    .delete(lessons)
    .where(and(eq(lessons.id, lessonId), eq(lessons.userId, userId)))
    .returning({ id: lessons.id });
  if (result.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
