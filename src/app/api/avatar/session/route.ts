import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { avatarSessions, decks } from '@/db/schema';
import { apiUser } from '@/lib/api-auth';
import { logSpend } from '@/lib/cost-tracking';

const schema = z.object({
  // Optional: deck-bound practice sessions pass a deckId; the deck-less "Free
  // conversation" view (§7) omits it and only logs spend.
  deckId: z.string().uuid().optional(),
  durationSeconds: z.number().int().min(0),
  costUsd: z.number().min(0),
  turnCount: z.number().int().min(0),
});

// POST /api/avatar/session — record a completed Kruu Bingo session and log its
// estimated cost to the consolidated spend log. For deck practice this also
// records an avatar_sessions row and bumps the deck's "last studied"; free
// conversation (no deckId) only logs the spend.
export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }
  const d = parsed.data;

  if (d.deckId) {
    // Only allow recording against a deck the caller owns.
    const [deck] = await db
      .select({ id: decks.id })
      .from(decks)
      .where(and(eq(decks.id, d.deckId), eq(decks.userId, user.id)))
      .limit(1);
    if (!deck) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await db.insert(avatarSessions).values({
      userId: user.id,
      deckId: d.deckId,
      durationSeconds: d.durationSeconds,
      costUsd: d.costUsd.toFixed(6),
      turnCount: d.turnCount,
    });
    // Practicing a deck with AI Voice Chat counts as studying it — keep the deck
    // list's "Last studied" in sync, the same way flashcard sessions do.
    await db.update(decks).set({ lastStudiedAt: new Date() }).where(eq(decks.id, d.deckId));
  }
  // Always log the estimated cost — deck-bound or free conversation — so spend
  // caps cover both.
  await logSpend(user.id, 'avatar', d.costUsd, `Kruu Bingo session ${d.durationSeconds}s`);

  return NextResponse.json({ ok: true });
}
