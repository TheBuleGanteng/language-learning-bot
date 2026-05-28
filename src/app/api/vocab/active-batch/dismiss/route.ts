import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { imageGenerationBatches } from '@/db/schema';
import { auth } from '@/lib/auth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const schema = z.object({
  batchId: z.string().regex(UUID_RE),
});

/**
 * Stamp `notification_dismissed_at` so future polls don't re-surface the
 * completion popup. Ownership is enforced by including the user id in the
 * WHERE — a bogus batchId from another user is a silent no-op.
 */
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
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  await db
    .update(imageGenerationBatches)
    .set({ notificationDismissedAt: new Date() })
    .where(
      and(
        eq(imageGenerationBatches.id, parsed.data.batchId),
        eq(imageGenerationBatches.userId, userId),
      ),
    );

  return NextResponse.json({ ok: true });
}
