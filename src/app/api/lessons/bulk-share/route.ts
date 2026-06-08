import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { lessons } from '@/db/schema';
import { apiUser } from '@/lib/api-auth';
import { canShare } from '@/lib/roles';
import { applyLessonShare, shareConfigSchema, splitOwnership } from '@/lib/lesson-share';

// Part 5.1 — apply ONE granular sharing config to MANY lessons. Creator-only:
// lessons created by someone else are skipped + counted (not modified). Reuses
// the per-lesson sharing logic so the rules stay in one place.

const schema = z.object({
  lessonIds: z.array(z.string().uuid()).min(1).max(1000),
  shareConfig: shareConfigSchema,
});

export async function PATCH(req: Request) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canShare(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  const ids = [...new Set(parsed.data.lessonIds)];
  const { shareConfig } = parsed.data;

  // Creator-only: only lessons this user created are modified.
  const owned = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(and(inArray(lessons.id, ids), eq(lessons.createdBy, user.id)));
  const { updatedIds, skippedIds } = splitOwnership(ids, owned.map((l) => l.id));

  if (updatedIds.length) {
    await db.transaction(async (tx) => {
      for (const id of updatedIds) {
        await applyLessonShare(tx, user.id, id, shareConfig);
      }
    });
  }

  return NextResponse.json({
    updated: updatedIds.length,
    skipped: skippedIds.length,
    skippedIds,
  });
}
