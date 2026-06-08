import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { lessons, lessonFiles } from '@/db/schema';
import { apiUser } from '@/lib/api-auth';
import { storage } from '@/lib/storage';
import { splitOwnership } from '@/lib/lesson-share';

// Part 5.2 — bulk delete lessons. Deletes the lesson records and (by FK cascade)
// their lesson_files / lesson_links / vocab_lessons join rows. Does NOT delete
// vocab_items — they exist independently and may belong to other lessons.
// Creator-only: lessons created by someone else are skipped + counted.

const schema = z.object({
  lessonIds: z.array(z.string().uuid()).min(1).max(1000),
});

export async function DELETE(req: Request) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  const ids = [...new Set(parsed.data.lessonIds)];

  // Creator-only.
  const owned = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(and(inArray(lessons.id, ids), eq(lessons.createdBy, user.id)));
  const { updatedIds: ownedIds, skippedIds } = splitOwnership(ids, owned.map((l) => l.id));

  // Collect file storage keys before deletion for best-effort cleanup.
  const fileKeys = ownedIds.length
    ? (
        await db
          .select({ storageKey: lessonFiles.storageKey })
          .from(lessonFiles)
          .where(inArray(lessonFiles.lessonId, ownedIds))
      ).map((f) => f.storageKey)
    : [];

  if (ownedIds.length) {
    // Single transaction. Deleting the lesson rows cascades lesson_files,
    // lesson_links, and vocab_lessons; vocab_items are intentionally untouched.
    await db.transaction(async (tx) => {
      await tx
        .delete(lessons)
        .where(and(inArray(lessons.id, ownedIds), eq(lessons.createdBy, user.id)));
    });

    // Best-effort storage cleanup after commit (orphans are recoverable).
    const store = storage();
    await Promise.all(
      fileKeys.map(async (key) => {
        try {
          await store.delete(key);
        } catch (err) {
          console.error(`Failed to delete storage key during bulk lesson delete: ${key}`, err);
        }
      }),
    );
  }

  return NextResponse.json({
    deleted: ownedIds.length,
    skipped: skippedIds.length,
    skippedIds,
  });
}
