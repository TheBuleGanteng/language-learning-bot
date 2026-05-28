import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { lessonLinks } from '@/db/schema';
import { auth } from '@/lib/auth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ lessonId: string; linkId: string }> },
) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { lessonId, linkId } = await ctx.params;
  if (!UUID_RE.test(lessonId) || !UUID_RE.test(linkId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const result = await db
    .delete(lessonLinks)
    .where(
      and(
        eq(lessonLinks.id, linkId),
        eq(lessonLinks.lessonId, lessonId),
        eq(lessonLinks.userId, userId),
      ),
    )
    .returning({ id: lessonLinks.id });
  if (result.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
