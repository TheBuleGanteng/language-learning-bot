import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { lessons } from '@/db/schema';
import { auth } from '@/lib/auth';

export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await db
    .select({ id: lessons.id, name: lessons.name, lessonNumber: lessons.lessonNumber })
    .from(lessons)
    .where(eq(lessons.userId, userId))
    .orderBy(asc(lessons.lessonNumber), asc(lessons.name));
  return NextResponse.json({ lessons: rows });
}
