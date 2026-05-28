import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { lessonFiles } from '@/db/schema';
import { auth } from '@/lib/auth';
import { storage } from '@/lib/storage';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ lessonId: string; fileId: string }> },
) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { lessonId, fileId } = await ctx.params;
  if (!UUID_RE.test(lessonId) || !UUID_RE.test(fileId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const [row] = await db
    .select()
    .from(lessonFiles)
    .where(
      and(
        eq(lessonFiles.id, fileId),
        eq(lessonFiles.lessonId, lessonId),
        eq(lessonFiles.userId, userId),
      ),
    )
    .limit(1);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const url = await storage().getUrl(row.storageKey);
  return NextResponse.json({
    id: row.id,
    kind: row.kind,
    filename: row.filename,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt,
    url,
  });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ lessonId: string; fileId: string }> },
) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { lessonId, fileId } = await ctx.params;
  if (!UUID_RE.test(lessonId) || !UUID_RE.test(fileId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const [row] = await db
    .select()
    .from(lessonFiles)
    .where(
      and(
        eq(lessonFiles.id, fileId),
        eq(lessonFiles.lessonId, lessonId),
        eq(lessonFiles.userId, userId),
      ),
    )
    .limit(1);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await storage().delete(row.storageKey);
  await db.delete(lessonFiles).where(eq(lessonFiles.id, fileId));

  return NextResponse.json({ ok: true });
}
