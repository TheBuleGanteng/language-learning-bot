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
import { buildOrderBy } from '@/lib/vocab';
import { storage } from '@/lib/storage';
import { escapeRegex, normalizeText } from '@/lib/text-normalize';

const DEFAULT_PAGE_SIZE = 100;
const ALLOWED_PAGE_SIZES = new Set([25, 50, 100]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parsePageSize(raw: string | null): number | 'all' {
  if (raw === 'all') return 'all';
  const n = parseInt(raw ?? '', 10);
  if (Number.isFinite(n) && ALLOWED_PAGE_SIZES.has(n)) return n;
  return DEFAULT_PAGE_SIZE;
}

export async function GET(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const pageSize = parsePageSize(url.searchParams.get('pageSize'));
  const search = (url.searchParams.get('search') ?? '').trim();
  const lessonIds = url.searchParams.getAll('lesson').filter((s) => UUID_RE.test(s));
  // `lessonId` (singular) is a convenience scoping param used by the lesson
  // detail page's vocab table — we merge it into the lessonIds list and force
  // mode=and so additional client filters compose properly.
  const scopedLessonId = url.searchParams.get('lessonId');
  if (scopedLessonId && UUID_RE.test(scopedLessonId) && !lessonIds.includes(scopedLessonId)) {
    lessonIds.push(scopedLessonId);
  }
  const tagIds = url.searchParams.getAll('tag').filter((s) => UUID_RE.test(s));
  const mode = url.searchParams.get('mode') === 'or' ? 'or' : 'and';

  // imageStatus filter: 'has' (completed), 'none' (strict — only
  // image_status='none'), 'failed' (failed+refused). 'generating' is
  // intentionally NOT folded into 'none' so items don't briefly disappear
  // from the No-image view as they transition through 'generating'; the
  // bulk-batch flow switches the filter to 'all' on submit to keep
  // in-flight items visible.
  const imageFilter = url.searchParams.get('imageStatus');
  const orderByExpr = buildOrderBy(
    url.searchParams.get('sort'),
    url.searchParams.get('order'),
  );

  // Accent-agnostic search: match on the normalized columns (diacritics
  // stripped, IPA mapped to Latin, lowercased) so `saai` finds `sǎai`.
  const qn = search ? normalizeText(search) : '';
  const wheres = [eq(vocabItems.userId, userId)];
  if (search) {
    wheres.push(
      or(
        ilike(vocabItems.targetTextNormalized, `%${qn}%`),
        ilike(vocabItems.nativeTextNormalized, `%${qn}%`),
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

  if (imageFilter === 'has') {
    wheres.push(eq(vocabItems.imageStatus, 'completed'));
  } else if (imageFilter === 'none') {
    wheres.push(eq(vocabItems.imageStatus, 'none'));
  } else if (imageFilter === 'failed') {
    wheres.push(
      or(eq(vocabItems.imageStatus, 'failed'), eq(vocabItems.imageStatus, 'refused'))!,
    );
  }

  const whereExpr = and(...wheres);

  // Relevance ranking, applied only when searching and the user hasn't asked
  // for an explicit column sort (which always wins). Tiers, best first:
  //   1 exact match on original text (visually exact)
  //   2 exact match on normalized text (e.g. "saai" ↔ "sǎai")
  //   3 whole-word match  4 prefix match  5 substring match
  // Tiebreaker: shorter of the two fields first.
  const regexQn = escapeRegex(qn);
  const wordPattern = `\\m${regexQn}\\M`;
  const searchOrder =
    search
      ? sql`CASE
          WHEN lower(${vocabItems.targetText}) = lower(${search}) OR lower(${vocabItems.nativeText}) = lower(${search}) THEN 1
          WHEN ${vocabItems.targetTextNormalized} = ${qn} OR ${vocabItems.nativeTextNormalized} = ${qn} THEN 2
          WHEN ${vocabItems.targetTextNormalized} ~* ${wordPattern} OR ${vocabItems.nativeTextNormalized} ~* ${wordPattern} THEN 3
          WHEN ${vocabItems.targetTextNormalized} LIKE ${qn + '%'} OR ${vocabItems.nativeTextNormalized} LIKE ${qn + '%'} THEN 4
          WHEN ${vocabItems.targetTextNormalized} LIKE ${'%' + qn + '%'} OR ${vocabItems.nativeTextNormalized} LIKE ${'%' + qn + '%'} THEN 5
          ELSE 6
        END ASC, LEAST(LENGTH(${vocabItems.targetText}), LENGTH(${vocabItems.nativeText})) ASC`
      : null;
  // Precedence: explicit sort > search relevance > default (newest first).
  const finalOrder = orderByExpr ?? searchOrder ?? desc(vocabItems.createdAt);

  const [totalRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(vocabItems)
    .where(whereExpr);
  const total = totalRow?.n ?? 0;

  // For pageSize='all' we omit LIMIT entirely so the caller gets every match.
  // Cumulative "Load more" in the UI re-fetches with `page` bumped: backend
  // simply returns that page slice — accumulation happens client-side.
  const baseQuery = db
    .select()
    .from(vocabItems)
    .where(whereExpr)
    .orderBy(finalOrder);
  const items =
    pageSize === 'all'
      ? await baseQuery
      : await baseQuery.limit(pageSize).offset((page - 1) * pageSize);

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

  const hasMore =
    pageSize === 'all' ? false : (page - 1) * pageSize + items.length < total;

  const store = storage();
  // Vocab images are public (written via putPublic), so resolve them to their
  // stable public URL. This is synchronous and cannot throw — unlike per-row
  // signed-URL generation, which on the GCS driver could fail or time out and
  // take the whole list response (and thus the table) down with it.
  const itemsWithUrls = items.map((i) => ({
    ...i,
    lessons: lessonMap.get(i.id) ?? [],
    tags: tagMap.get(i.id) ?? [],
    imageUrl: i.imageStorageKey ? store.publicUrl(i.imageStorageKey) : null,
  }));

  return NextResponse.json({
    items: itemsWithUrls,
    page,
    pageSize: pageSize === 'all' ? 'all' : pageSize,
    total,
    hasMore,
  });
}


const createSchema = z.object({
  targetText: z.string().min(1).max(500),
  nativeText: z.string().min(1).max(500),
  transliteration: z.string().max(500).nullable().optional(),
  pos: z.string().max(50).nullable().optional(),
  exampleTarget: z.string().max(1000).nullable().optional(),
  exampleNative: z.string().max(1000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  // Association sets. [] or absent → no associations.
  lessonIds: z.array(z.string().uuid()).max(100).optional(),
  tagIds: z.array(z.string().uuid()).max(50).optional(),
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
        targetTextNormalized: normalizeText(d.targetText),
        nativeTextNormalized: normalizeText(d.nativeText),
        transliteration: d.transliteration ?? null,
        pos: d.pos ?? null,
        exampleTarget: d.exampleTarget ?? null,
        exampleNative: d.exampleNative ?? null,
        notes: d.notes ?? null,
      })
      .returning({ id: vocabItems.id });

    if (d.lessonIds && d.lessonIds.length > 0) {
      // Only associate lessons the user owns — guards against cross-user IDs.
      const owned = await tx
        .select({ id: lessons.id })
        .from(lessons)
        .where(and(eq(lessons.userId, userId), inArray(lessons.id, d.lessonIds)));
      if (owned.length > 0) {
        await tx
          .insert(vocabLessons)
          .values(owned.map((l) => ({ vocabItemId: inserted.id, lessonId: l.id })))
          .onConflictDoNothing();
      }
    }
    if (d.tagIds && d.tagIds.length > 0) {
      const owned = await tx
        .select({ id: tags.id })
        .from(tags)
        .where(and(eq(tags.userId, userId), inArray(tags.id, d.tagIds)));
      if (owned.length > 0) {
        await tx
          .insert(vocabTags)
          .values(owned.map((t) => ({ vocabItemId: inserted.id, tagId: t.id })))
          .onConflictDoNothing();
      }
    }
    return inserted.id;
  });

  return NextResponse.json({ id: newId }, { status: 201 });
}
