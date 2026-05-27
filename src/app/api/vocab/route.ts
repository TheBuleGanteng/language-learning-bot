import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, ilike, or, sql, desc, inArray } from 'drizzle-orm';
import { db } from '@/db';
import {
  vocabItems,
  vocabTags,
  vocabLessons,
  lessons,
  tags,
} from '@/db/schema';
import { auth } from '@/lib/auth';
import { findOrCreateLesson, findOrCreateTags, buildOrderBy } from '@/lib/vocab';

const PAGE_SIZE = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const search = (url.searchParams.get('search') ?? '').trim();
  const lessonIds = url.searchParams.getAll('lesson').filter((s) => UUID_RE.test(s));
  const tagIds = url.searchParams.getAll('tag').filter((s) => UUID_RE.test(s));
  const mode = url.searchParams.get('mode') === 'or' ? 'or' : 'and';
  const orderByExpr = buildOrderBy(
    url.searchParams.get('sort'),
    url.searchParams.get('order'),
  );

  const wheres = [eq(vocabItems.userId, userId)];
  if (search) {
    wheres.push(
      or(
        ilike(vocabItems.targetText, `%${search}%`),
        ilike(vocabItems.nativeText, `%${search}%`),
      )!,
    );
  }

  // EXISTS subqueries — IDs already validated to be UUIDs above, so safe to
  // interpolate via sql.raw.
  const lessonClause = lessonIds.length
    ? sql`EXISTS (SELECT 1 FROM vocab_lessons vl WHERE vl.vocab_item_id = ${vocabItems.id} AND vl.lesson_id IN ${sql.raw(`(${lessonIds.map((id) => `'${id}'`).join(',')})`)})`
    : null;
  const tagClause = tagIds.length
    ? sql`EXISTS (SELECT 1 FROM vocab_tags vt WHERE vt.vocab_item_id = ${vocabItems.id} AND vt.tag_id IN ${sql.raw(`(${tagIds.map((id) => `'${id}'`).join(',')})`)})`
    : null;

  if (lessonClause && tagClause) {
    wheres.push(mode === 'or' ? or(lessonClause, tagClause)! : and(lessonClause, tagClause)!);
  } else if (lessonClause) {
    wheres.push(lessonClause);
  } else if (tagClause) {
    wheres.push(tagClause);
  }

  const whereExpr = and(...wheres);

  const [totalRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(vocabItems)
    .where(whereExpr);
  const total = totalRow?.n ?? 0;

  const items = await db
    .select()
    .from(vocabItems)
    .where(whereExpr)
    .orderBy(orderByExpr ?? desc(vocabItems.createdAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const ids = items.map((i) => i.id);

  const itemLessons = ids.length
    ? await db
        .select({
          vocabItemId: vocabLessons.vocabItemId,
          id: lessons.id,
          name: lessons.name,
        })
        .from(vocabLessons)
        .innerJoin(lessons, eq(lessons.id, vocabLessons.lessonId))
        .where(inArray(vocabLessons.vocabItemId, ids))
    : [];
  const itemTags = ids.length
    ? await db
        .select({
          vocabItemId: vocabTags.vocabItemId,
          id: tags.id,
          name: tags.name,
        })
        .from(vocabTags)
        .innerJoin(tags, eq(tags.id, vocabTags.tagId))
        .where(inArray(vocabTags.vocabItemId, ids))
    : [];

  const lessonMap = new Map<string, { id: string; name: string }[]>();
  for (const l of itemLessons) {
    const arr = lessonMap.get(l.vocabItemId) ?? [];
    arr.push({ id: l.id, name: l.name });
    lessonMap.set(l.vocabItemId, arr);
  }
  const tagMap = new Map<string, { id: string; name: string }[]>();
  for (const t of itemTags) {
    const arr = tagMap.get(t.vocabItemId) ?? [];
    arr.push({ id: t.id, name: t.name });
    tagMap.set(t.vocabItemId, arr);
  }

  const hasMore = (page - 1) * PAGE_SIZE + items.length < total;

  return NextResponse.json({
    items: items.map((i) => ({
      ...i,
      lessons: lessonMap.get(i.id) ?? [],
      tags: tagMap.get(i.id) ?? [],
    })),
    page,
    pageSize: PAGE_SIZE,
    total,
    hasMore,
  });
}


const createSchema = z.object({
  targetText: z.string().min(1).max(500),
  nativeText: z.string().min(1).max(500),
  transliteration: z.string().max(500).optional(),
  pos: z.string().max(50).optional(),
  exampleTarget: z.string().max(1000).optional(),
  exampleNative: z.string().max(1000).optional(),
  notes: z.string().max(2000).optional(),
  lessonName: z.string().max(200).optional(),
  tagNames: z.array(z.string().max(50)).max(20).optional(),
});

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
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const d = parsed.data;

  const newId = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(vocabItems)
      .values({
        userId,
        targetText: d.targetText,
        nativeText: d.nativeText,
        transliteration: d.transliteration ?? null,
        pos: d.pos ?? null,
        exampleTarget: d.exampleTarget ?? null,
        exampleNative: d.exampleNative ?? null,
        notes: d.notes ?? null,
      })
      .returning({ id: vocabItems.id });

    if (d.lessonName?.trim()) {
      const lessonId = await findOrCreateLesson(tx, userId, d.lessonName);
      await tx
        .insert(vocabLessons)
        .values({ vocabItemId: inserted.id, lessonId })
        .onConflictDoNothing();
    }
    if (d.tagNames && d.tagNames.length > 0) {
      const tagIds = await findOrCreateTags(tx, userId, d.tagNames);
      if (tagIds.length) {
        await tx
          .insert(vocabTags)
          .values(tagIds.map((tagId) => ({ vocabItemId: inserted.id, tagId })))
          .onConflictDoNothing();
      }
    }
    return inserted.id;
  });

  return NextResponse.json({ id: newId }, { status: 201 });
}
