import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { decks } from '@/db/schema';
import { apiUser } from '@/lib/api-auth';
import { requireDeckOwner } from '@/lib/decks';

// DELETE /api/decks/[id] — owner only. deck_items, card_reviews, study_sessions
// all cascade via FK.
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
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

  await db.delete(decks).where(eq(decks.id, id));
  return NextResponse.json({ ok: true });
}
