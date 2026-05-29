import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { planLessonDeletion, toSummary } from '@/lib/lesson-deletion';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ lessonId: string }> },
) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { lessonId } = await ctx.params;
  if (!UUID_RE.test(lessonId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const plan = await planLessonDeletion(userId, lessonId);
  if (!plan) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(toSummary(plan));
}
