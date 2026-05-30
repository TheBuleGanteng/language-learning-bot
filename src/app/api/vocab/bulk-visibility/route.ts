import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { vocabItems } from '@/db/schema';
import { apiUser } from '@/lib/api-auth';
import { canShare } from '@/lib/roles';

const schema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(1000),
  visibility: z.enum(['shared', 'private']),
});

export async function PATCH(req: Request) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canShare(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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
  const ids = [...new Set(parsed.data.ids)];

  // Only the caller's own items are updated; the rest are silently skipped.
  const owned = await db
    .select({ id: vocabItems.id })
    .from(vocabItems)
    .where(and(inArray(vocabItems.id, ids), eq(vocabItems.createdBy, user.id)));
  const ownedIds = owned.map((o) => o.id);

  if (ownedIds.length) {
    await db
      .update(vocabItems)
      .set({ visibility: parsed.data.visibility, updatedAt: new Date() })
      .where(inArray(vocabItems.id, ownedIds));
  }

  return NextResponse.json({ updated: ownedIds.length, skipped: ids.length - ownedIds.length });
}
