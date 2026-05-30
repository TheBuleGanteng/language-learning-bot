import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { decks, studySessions } from '@/db/schema';
import { apiUser } from '@/lib/api-auth';
import { requireDeckOwner } from '@/lib/decks';

const sessionSchema = z.object({
  againCount: z.number().int().min(0),
  hardCount: z.number().int().min(0),
  goodCount: z.number().int().min(0),
  easyCount: z.number().int().min(0),
  cardsReviewed: z.number().int().min(0),
});

// POST /api/decks/[id]/session — record a completed study session and stamp
// the deck's lastStudiedAt.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;

  const owner = await requireDeckOwner(id, user.id);
  if (!owner.ok) {
    return NextResponse.json(
      { error: owner.status === 403 ? 'Forbidden' : 'Not found' },
      { status: owner.status },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = sessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  await db.transaction(async (tx) => {
    await tx.insert(studySessions).values({ deckId: id, userId: user.id, ...parsed.data });
    await tx.update(decks).set({ lastStudiedAt: new Date() }).where(eq(decks.id, id));
  });

  return NextResponse.json({ ok: true });
}
