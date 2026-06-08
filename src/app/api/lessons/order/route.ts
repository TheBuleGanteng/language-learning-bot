import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { lessons, lessonOrder } from '@/db/schema';
import { apiUser } from '@/lib/api-auth';
import { lessonVisibleSql } from '@/lib/visibility';
import { computeInsertPosition, initialPositions } from '@/lib/manual-order';

// Per-user manual ordering of lessons (Part 3). Personal — any viewable lesson
// can be ordered (own or shared), no creator gate.

const patchSchema = z.object({
  movedId: z.string().uuid(),
  beforeId: z.string().uuid().optional(),
  afterId: z.string().uuid().optional(),
});

/** Natural (numeric-aware), case-insensitive compare — matches lib/lessons-sort. */
function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export async function PATCH(req: Request) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  const { movedId, beforeId, afterId } = parsed.data;

  // The moved lesson must be viewable by this user.
  const [viewable] = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(and(eq(lessons.id, movedId), lessonVisibleSql(user.id)))
    .limit(1);
  if (!viewable) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await db.transaction(async (tx) => {
    const [mc] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(lessonOrder)
      .where(eq(lessonOrder.userId, user.id));
    if ((mc?.n ?? 0) === 0) {
      // Lazy full-set init in the default display order (Z→A natural by name).
      // Natural sort isn't expressible in SQL, so order in JS over the (small)
      // set of visible lessons.
      const visible = await tx
        .select({ id: lessons.id, name: lessons.name })
        .from(lessons)
        .where(lessonVisibleSql(user.id));
      visible.sort((a, b) => naturalCompare(b.name, a.name)); // Z→A
      const seed = initialPositions(visible.map((l) => l.id));
      if (seed.length > 0) {
        await tx
          .insert(lessonOrder)
          .values(seed.map((s) => ({ userId: user.id, lessonId: s.id, position: s.position })))
          .onConflictDoNothing();
      }
    }

    const posOf = async (id?: string): Promise<number | null> => {
      if (!id) return null;
      const [row] = await tx
        .select({ position: lessonOrder.position })
        .from(lessonOrder)
        .where(and(eq(lessonOrder.userId, user.id), eq(lessonOrder.lessonId, id)))
        .limit(1);
      return row?.position ?? null;
    };
    const beforePos = await posOf(beforeId);
    const afterPos = await posOf(afterId);
    const position = computeInsertPosition(beforePos, afterPos);

    await tx
      .insert(lessonOrder)
      .values({ userId: user.id, lessonId: movedId, position })
      .onConflictDoUpdate({
        target: [lessonOrder.userId, lessonOrder.lessonId],
        set: { position, updatedAt: new Date() },
      });
  });

  return NextResponse.json({ ok: true });
}

/** DELETE — clear this user's manual lesson order (revert to the computed sort). */
export async function DELETE() {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await db.delete(lessonOrder).where(eq(lessonOrder.userId, user.id));
  return NextResponse.json({ ok: true });
}
