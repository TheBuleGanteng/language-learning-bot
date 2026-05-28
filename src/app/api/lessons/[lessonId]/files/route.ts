import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { lessons, lessonFiles } from '@/db/schema';
import { auth } from '@/lib/auth';
import { storage } from '@/lib/storage';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * List files for a lesson. Resolves a browser-loadable URL per file:
 * local driver → /api/files/... route; GCS driver → signed URL.
 */
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

  const [lesson] = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(and(eq(lessons.id, lessonId), eq(lessons.userId, userId)))
    .limit(1);
  if (!lesson) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const rows = await db
    .select()
    .from(lessonFiles)
    .where(eq(lessonFiles.lessonId, lessonId))
    .orderBy(asc(lessonFiles.createdAt));

  const provider = storage();
  const out = await Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      kind: r.kind,
      filename: r.filename,
      contentType: r.contentType,
      sizeBytes: r.sizeBytes,
      createdAt: r.createdAt,
      url: await provider.getUrl(r.storageKey),
    })),
  );

  return NextResponse.json({ files: out });
}
