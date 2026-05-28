import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  lessons,
  tags,
  vocabItems,
  vocabLessons,
  vocabTags,
} from '@/db/schema';
import { auth } from '@/lib/auth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const rowSchema = z.object({
  targetText: z.string().min(1).max(500),
  nativeText: z.string().min(1).max(500),
  tagIds: z.array(z.string().regex(UUID_RE)).max(20).default([]),
  lessonIds: z.array(z.string().regex(UUID_RE)).max(10).default([]),
});

const bodySchema = z.object({
  rows: z.array(rowSchema).min(1).max(500),
});

/**
 * Commit reviewed extraction rows to the user's vocab. For each row:
 *  - If an existing vocab item with the same (target, native) already
 *    exists for the user, merge the row's lessons/tags into it.
 *  - Otherwise, insert a new vocab item with those lessons/tags.
 *
 * Returns a summary: { inserted, mergedExisting, errors }.
 */
export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  // Validate tag + lesson ownership in bulk before mutating.
  const allTagIds = unique(parsed.data.rows.flatMap((r) => r.tagIds));
  const allLessonIds = unique(parsed.data.rows.flatMap((r) => r.lessonIds));

  const ownedTags = allTagIds.length
    ? await db
        .select({ id: tags.id })
        .from(tags)
        .where(and(eq(tags.userId, userId), inArray(tags.id, allTagIds)))
    : [];
  const ownedLessons = allLessonIds.length
    ? await db
        .select({ id: lessons.id })
        .from(lessons)
        .where(and(eq(lessons.userId, userId), inArray(lessons.id, allLessonIds)))
    : [];

  const tagOk = new Set(ownedTags.map((t) => t.id));
  const lessonOk = new Set(ownedLessons.map((l) => l.id));

  // Look up existing vocab matching any of the (target, native) pairs.
  // PostgreSQL doesn't have a tidy IN ((a,b),(c,d)) for composite, so we
  // pull a candidate set by target_text and filter in JS.
  const targetTexts = unique(parsed.data.rows.map((r) => r.targetText.trim()));
  const existingRows = targetTexts.length
    ? await db
        .select({
          id: vocabItems.id,
          targetText: vocabItems.targetText,
          nativeText: vocabItems.nativeText,
        })
        .from(vocabItems)
        .where(
          and(
            eq(vocabItems.userId, userId),
            inArray(vocabItems.targetText, targetTexts),
          ),
        )
    : [];
  const existingMap = new Map<string, string>(); // key = `${target}\n${native}` → vocab id
  for (const e of existingRows) {
    existingMap.set(`${e.targetText.trim()}\n${e.nativeText.trim()}`, e.id);
  }

  let inserted = 0;
  let mergedExisting = 0;
  const errors: string[] = [];

  await db.transaction(async (tx) => {
    for (const row of parsed.data.rows) {
      const target = row.targetText.trim();
      const native = row.nativeText.trim();
      const key = `${target}\n${native}`;
      const tagIds = row.tagIds.filter((id) => tagOk.has(id));
      const lessonIds = row.lessonIds.filter((id) => lessonOk.has(id));

      const existingId = existingMap.get(key);
      try {
        if (existingId) {
          // Merge lessons + tags only — leave the existing item's text fields
          // alone (user edits in the master vocab table aren't overwritten).
          for (const lid of lessonIds) {
            await tx
              .insert(vocabLessons)
              .values({ vocabItemId: existingId, lessonId: lid })
              .onConflictDoNothing();
          }
          for (const tid of tagIds) {
            await tx
              .insert(vocabTags)
              .values({ vocabItemId: existingId, tagId: tid })
              .onConflictDoNothing();
          }
          mergedExisting += 1;
        } else {
          const [created] = await tx
            .insert(vocabItems)
            .values({
              userId,
              targetText: target,
              nativeText: native,
            })
            .returning({ id: vocabItems.id });
          for (const lid of lessonIds) {
            await tx
              .insert(vocabLessons)
              .values({ vocabItemId: created.id, lessonId: lid })
              .onConflictDoNothing();
          }
          for (const tid of tagIds) {
            await tx
              .insert(vocabTags)
              .values({ vocabItemId: created.id, tagId: tid })
              .onConflictDoNothing();
          }
          inserted += 1;
          // So a later row with the same (target, native) in this same batch
          // is treated as a merge into the just-created row.
          existingMap.set(key, created.id);
        }
      } catch (err) {
        errors.push(
          `${target} / ${native}: ${err instanceof Error ? err.message : 'unknown error'}`,
        );
      }
    }
  });

  return NextResponse.json({
    inserted,
    mergedExisting,
    errors,
  });
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

void sql; // silence unused warnings if any
