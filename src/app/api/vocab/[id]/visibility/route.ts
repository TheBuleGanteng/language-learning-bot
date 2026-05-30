import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { vocabItems } from '@/db/schema';
import { apiUser } from '@/lib/api-auth';
import { canShare } from '@/lib/roles';

const schema = z.object({ visibility: z.enum(['shared', 'private']) });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canShare(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await ctx.params;

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

  const [item] = await db
    .select({ createdBy: vocabItems.createdBy })
    .from(vocabItems)
    .where(eq(vocabItems.id, id))
    .limit(1);
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (item.createdBy !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [updated] = await db
    .update(vocabItems)
    .set({ visibility: parsed.data.visibility, updatedAt: new Date() })
    .where(eq(vocabItems.id, id))
    .returning();
  return NextResponse.json(updated);
}
