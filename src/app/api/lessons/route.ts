import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { db } from '@/db';
import { lessons, vocabLessons } from '@/db/schema';
import { auth } from '@/lib/auth';
import { lessonVisibleSql } from '@/lib/visibility';

const SORT_COLS = ['name', 'topic', 'date', 'vocab_count'] as const;
type SortCol = (typeof SORT_COLS)[number];

function buildOrderBy(sortRaw: string | null, orderRaw: string | null): SQL {
  const dir = orderRaw === 'desc' ? 'desc' : 'asc';
  const dirSql = dir === 'desc' ? sql`DESC` : sql`ASC`;
  const sort = (SORT_COLS as readonly string[]).includes(sortRaw ?? '')
    ? (sortRaw as SortCol)
    : null;
  switch (sort) {
    case 'name':
      return sql`${lessons.lessonNumber} ${dirSql} NULLS LAST, ${lessons.name} ${dirSql}`;
    case 'topic':
      return sql`${lessons.topic} ${dirSql} NULLS LAST`;
    case 'date':
      return sql`${lessons.date} ${dirSql} NULLS LAST`;
    case 'vocab_count':
      return sql`vocab_count ${dirSql}`;
    default:
      return sql`${lessons.lessonNumber} ASC NULLS LAST, ${lessons.name} ASC`;
  }
}

export async function GET(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const orderBy = buildOrderBy(url.searchParams.get('sort'), url.searchParams.get('order'));

  const rows = await db
    .select({
      id: lessons.id,
      name: lessons.name,
      lessonNumber: lessons.lessonNumber,
      topic: lessons.topic,
      date: lessons.date,
      createdAt: lessons.createdAt,
      lessonVisibility: lessons.visibility,
      vocabCount: sql<number>`count(${vocabLessons.vocabItemId})::int AS vocab_count`,
      // Material counts for the shared/partial/private indicator (across vocab,
      // files, and links). Correlated subqueries — independent of the groupBy.
      totalMaterials: sql<number>`(
        (SELECT count(*) FROM vocab_lessons vl WHERE vl.lesson_id = ${lessons.id})
        + (SELECT count(*) FROM lesson_files lf WHERE lf.lesson_id = ${lessons.id})
        + (SELECT count(*) FROM lesson_links ll WHERE ll.lesson_id = ${lessons.id})
      )::int`,
      sharedMaterials: sql<number>`(
        (SELECT count(*) FROM vocab_lessons vl JOIN vocab_items vi ON vi.id = vl.vocab_item_id
           WHERE vl.lesson_id = ${lessons.id} AND vi.visibility = 'shared')
        + (SELECT count(*) FROM lesson_files lf WHERE lf.lesson_id = ${lessons.id} AND lf.visibility = 'shared')
        + (SELECT count(*) FROM lesson_links ll WHERE ll.lesson_id = ${lessons.id} AND ll.visibility = 'shared')
      )::int`,
    })
    .from(lessons)
    .leftJoin(vocabLessons, eq(vocabLessons.lessonId, lessons.id))
    .where(lessonVisibleSql(userId))
    .groupBy(lessons.id)
    .orderBy(orderBy);

  // Derive the per-lesson visibility status: shared (all materials shared),
  // partial (some), or private (none). Empty lessons fall back to the flag.
  const out = rows.map(({ totalMaterials, sharedMaterials, lessonVisibility, ...r }) => {
    let visibility: 'private' | 'partial' | 'shared';
    if (totalMaterials === 0) {
      visibility = lessonVisibility === 'shared' ? 'shared' : 'private';
    } else if (sharedMaterials === 0) {
      visibility = 'private';
    } else if (sharedMaterials >= totalMaterials) {
      visibility = 'shared';
    } else {
      visibility = 'partial';
    }
    return { ...r, visibility };
  });

  return NextResponse.json({ lessons: out });
}

const createSchema = z.object({
  name: z.string().min(1).max(200),
  topic: z.string().max(2000).nullable().optional(),
  date: z.string().nullable().optional(),
  lessonNumber: z.number().int().nullable().optional(),
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

  // Reject duplicate name for this user — UI shows the unique-violation as a clearer error.
  const [existing] = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(and(eq(lessons.userId, userId), eq(lessons.name, d.name.trim())))
    .limit(1);
  if (existing) {
    return NextResponse.json(
      { error: 'A lesson with that name already exists' },
      { status: 409 },
    );
  }

  const [created] = await db
    .insert(lessons)
    .values({
      userId,
      createdBy: userId,
      // visibility defaults to 'private'
      name: d.name.trim(),
      topic: d.topic ?? null,
      date: d.date ?? null,
      lessonNumber: d.lessonNumber ?? null,
    })
    .returning({ id: lessons.id, name: lessons.name });
  return NextResponse.json({ id: created.id, name: created.name }, { status: 201 });
}

// Re-export for future use — sort by createdAt as a fallback isn't currently exposed,
// kept here for documentation purposes.
void asc;
void desc;
