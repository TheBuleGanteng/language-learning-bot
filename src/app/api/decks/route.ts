import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, inArray, sql, desc, lte } from 'drizzle-orm';
import { db } from '@/db';
import {
  decks,
  deckItems,
  cardReviews,
  studySessions,
  vocabItems,
} from '@/db/schema';
import { apiUser } from '@/lib/api-auth';
import { buildNewCardReviews } from '@/lib/decks';
import { vocabVisibleSql } from '@/lib/visibility';

// =============================================================================
// GET /api/decks — list the caller's decks with per-deck counts + last session
// =============================================================================

export async function GET(req: Request) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(
    200,
    Math.max(1, parseInt(url.searchParams.get('limit') ?? '25', 10) || 25),
  );

  const [totalRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(decks)
    .where(eq(decks.userId, user.id));
  const total = totalRow?.n ?? 0;

  // Order by most-recently-studied, decks never studied last (NULLS LAST).
  const rows = await db
    .select()
    .from(decks)
    .where(eq(decks.userId, user.id))
    .orderBy(sql`${decks.lastStudiedAt} DESC NULLS LAST`, desc(decks.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  const ids = rows.map((d) => d.id);

  const cardCounts = ids.length
    ? await db
        .select({ deckId: cardReviews.deckId, n: sql<number>`count(*)::int` })
        .from(cardReviews)
        .where(inArray(cardReviews.deckId, ids))
        .groupBy(cardReviews.deckId)
    : [];
  const dueCounts = ids.length
    ? await db
        .select({ deckId: cardReviews.deckId, n: sql<number>`count(*)::int` })
        .from(cardReviews)
        .where(and(inArray(cardReviews.deckId, ids), lte(cardReviews.dueAt, sql`now()`)))
        .groupBy(cardReviews.deckId)
    : [];
  // Most recent study_sessions row per deck (DISTINCT ON deck_id).
  const lastSessions = ids.length
    ? await db
        .selectDistinctOn([studySessions.deckId])
        .from(studySessions)
        .where(inArray(studySessions.deckId, ids))
        .orderBy(studySessions.deckId, desc(studySessions.completedAt))
    : [];

  const cardMap = new Map(cardCounts.map((c) => [c.deckId, c.n]));
  const dueMap = new Map(dueCounts.map((c) => [c.deckId, c.n]));
  const sessionMap = new Map(lastSessions.map((s) => [s.deckId, s]));

  const result = rows.map((d) => {
    const s = sessionMap.get(d.id);
    return {
      ...d,
      cardCount: cardMap.get(d.id) ?? 0,
      dueCount: dueMap.get(d.id) ?? 0,
      lastSession: s
        ? {
            againCount: s.againCount,
            hardCount: s.hardCount,
            goodCount: s.goodCount,
            easyCount: s.easyCount,
            cardsReviewed: s.cardsReviewed,
            completedAt: s.completedAt,
          }
        : null,
    };
  });

  return NextResponse.json({ decks: result, total, page, limit });
}

// =============================================================================
// POST /api/decks — create a deck from hand-picked or filtered vocab items
// =============================================================================

const createSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    vocabItemIds: z.array(z.string().uuid()).min(1).max(2000),
    source: z.enum(['tag', 'lesson', 'manual']),
    sourceId: z.string().uuid().optional().nullable(),
    direction: z.enum(['forward', 'reverse', 'both']),
  })
  .refine((d) => d.source === 'manual' || !!d.sourceId, {
    message: 'sourceId is required for tag and lesson decks',
    path: ['sourceId'],
  });

export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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

  // Only include items the caller can actually see.
  const ids = [...new Set(d.vocabItemIds)];
  const visible = await db
    .select({ id: vocabItems.id })
    .from(vocabItems)
    .where(and(inArray(vocabItems.id, ids), vocabVisibleSql(user.id)));
  const visibleIds = visible.map((v) => v.id);
  if (visibleIds.length === 0) {
    return NextResponse.json({ error: 'No accessible vocab items' }, { status: 400 });
  }

  const deckId = await db.transaction(async (tx) => {
    const [deck] = await tx
      .insert(decks)
      .values({
        userId: user.id,
        name: d.name,
        source: d.source,
        sourceId: d.source === 'manual' ? null : (d.sourceId ?? null),
        direction: d.direction,
      })
      .returning({ id: decks.id });

    await tx
      .insert(deckItems)
      .values(visibleIds.map((vocabItemId) => ({ deckId: deck.id, vocabItemId })))
      .onConflictDoNothing();

    await tx.insert(cardReviews).values(buildNewCardReviews(deck.id, visibleIds, d.direction));
    return deck.id;
  });

  const [created] = await db.select().from(decks).where(eq(decks.id, deckId)).limit(1);
  const [{ n: cardCount }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(cardReviews)
    .where(eq(cardReviews.deckId, deckId));

  return NextResponse.json({ ...created, cardCount }, { status: 201 });
}
