import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { vocabItems, vocabTags, vocabLessons, lessons, tags, vocabItemGlosses } from '@/db/schema';
import { auth } from '@/lib/auth';
import { storage } from '@/lib/storage';
import { normalizeText } from '@/lib/text-normalize';
import { vocabVisibleSql } from '@/lib/visibility';

async function getUserId() {
  const session = await auth();
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;

  const [item] = await db
    .select()
    .from(vocabItems)
    .where(and(eq(vocabItems.id, id), vocabVisibleSql(userId)))
    .limit(1);
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const itemLessons = await db
    .select({ id: lessons.id, name: lessons.name })
    .from(vocabLessons)
    .innerJoin(lessons, eq(lessons.id, vocabLessons.lessonId))
    .where(eq(vocabLessons.vocabItemId, id));
  const itemTags = await db
    .select({ id: tags.id, name: tags.name })
    .from(vocabTags)
    .innerJoin(tags, eq(tags.id, vocabTags.tagId))
    .where(eq(vocabTags.vocabItemId, id));

  const imageUrl = item.imageStorageKey
    ? storage().publicUrl(item.imageStorageKey)
    : null;

  return NextResponse.json({
    ...item,
    lessons: itemLessons,
    tags: itemTags,
    imageUrl,
  });
}

const patchSchema = z.object({
  targetText: z.string().min(1).max(500).optional(),
  nativeText: z.string().min(1).max(500).optional(),
  transliteration: z.string().max(500).nullable().optional(),
  pos: z.string().max(50).nullable().optional(),
  exampleTarget: z.string().max(1000).nullable().optional(),
  exampleNative: z.string().max(1000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  // Full-replacement sets. Present → associations replaced with exactly these
  // IDs ([] clears all). Absent → associations left unchanged.
  lessonIds: z.array(z.string().uuid()).max(100).optional(),
  tagIds: z.array(z.string().uuid()).max(50).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;

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

  // Ownership guard (§3b): only the creator may edit. 404 if it doesn't exist,
  // 403 if it exists but belongs to someone else.
  const [owner] = await db
    .select({ createdBy: vocabItems.createdBy })
    .from(vocabItems)
    .where(eq(vocabItems.id, id))
    .limit(1);
  if (!owner) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (owner.createdBy !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: vocabItems.id })
      .from(vocabItems)
      .where(eq(vocabItems.id, id))
      .limit(1);
    if (!existing) throw new Error('NOT_FOUND');

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (d.targetText !== undefined) {
      updates.targetText = d.targetText;
      updates.targetTextNormalized = normalizeText(d.targetText);
    }
    if (d.nativeText !== undefined) {
      updates.nativeText = d.nativeText;
      updates.nativeTextNormalized = normalizeText(d.nativeText);
    }
    if (d.transliteration !== undefined) updates.transliteration = d.transliteration;
    if (d.pos !== undefined) updates.pos = d.pos;
    if (d.exampleTarget !== undefined) updates.exampleTarget = d.exampleTarget;
    if (d.exampleNative !== undefined) updates.exampleNative = d.exampleNative;
    if (d.notes !== undefined) updates.notes = d.notes;
    if (Object.keys(updates).length > 1) {
      await tx.update(vocabItems).set(updates).where(eq(vocabItems.id, id));
    }

    // C2 invalidation: if the meaning or the target word changed, drop all
    // cached per-language glosses so they regenerate from the new wording.
    if (d.nativeText !== undefined || d.targetText !== undefined) {
      await tx.delete(vocabItemGlosses).where(eq(vocabItemGlosses.vocabItemId, id));
    }

    if (d.lessonIds !== undefined) {
      // Full replacement of this item's lesson associations.
      await tx.delete(vocabLessons).where(eq(vocabLessons.vocabItemId, id));
      if (d.lessonIds.length > 0) {
        // Only associate lessons the user owns — guards against cross-user IDs.
        const owned = await tx
          .select({ id: lessons.id })
          .from(lessons)
          .where(and(eq(lessons.userId, userId), inArray(lessons.id, d.lessonIds)));
        if (owned.length > 0) {
          await tx
            .insert(vocabLessons)
            .values(owned.map((l) => ({ vocabItemId: id, lessonId: l.id })))
            .onConflictDoNothing();
        }
      }
    }

    if (d.tagIds !== undefined) {
      await tx.delete(vocabTags).where(eq(vocabTags.vocabItemId, id));
      if (d.tagIds.length > 0) {
        const owned = await tx
          .select({ id: tags.id })
          .from(tags)
          .where(and(eq(tags.userId, userId), inArray(tags.id, d.tagIds)));
        if (owned.length > 0) {
          await tx
            .insert(vocabTags)
            .values(owned.map((t) => ({ vocabItemId: id, tagId: t.id })))
            .onConflictDoNothing();
        }
      }
    }
  }).catch((err) => {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return null;
    }
    throw err;
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;

  // Ownership guard (§3b): only the creator may delete.
  const [owner] = await db
    .select({ createdBy: vocabItems.createdBy })
    .from(vocabItems)
    .where(eq(vocabItems.id, id))
    .limit(1);
  if (!owner) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (owner.createdBy !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await db.delete(vocabItems).where(eq(vocabItems.id, id));
  return NextResponse.json({ ok: true });
}
