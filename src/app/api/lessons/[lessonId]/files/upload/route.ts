import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { lessons, lessonFiles } from '@/db/schema';
import { auth } from '@/lib/auth';
import { storage } from '@/lib/storage';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
const AUDIO_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
]);

function safeFilename(name: string): string {
  // Strip path, normalize whitespace, keep extension, cap length.
  const base = name.split(/[\\/]/).pop() ?? 'file';
  return base.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ lessonId: string }> },
) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { lessonId } = await ctx.params;
  if (!UUID_RE.test(lessonId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Ownership check
  const [lesson] = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(and(eq(lessons.id, lessonId), eq(lessons.userId, userId)))
    .limit(1);
  if (!lesson) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = form.get('file');
  const kindRaw = form.get('kind');
  const kind = kindRaw === 'pdf' || kindRaw === 'audio' ? kindRaw : null;
  if (!kind) {
    return NextResponse.json({ error: 'kind must be "pdf" or "audio"' }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 });
  }

  if (kind === 'pdf') {
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDFs allowed' }, { status: 400 });
    }
    if (file.size > MAX_PDF_BYTES) {
      return NextResponse.json({ error: 'PDF exceeds 20MB' }, { status: 413 });
    }
  } else {
    if (!AUDIO_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'Unsupported audio format' }, { status: 400 });
    }
    if (file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: 'Audio exceeds 50MB' }, { status: 413 });
    }
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const cleanName = safeFilename(file.name);
  const storageKey = `users/${userId}/lessons/${lessonId}/${kind}/${randomUUID()}_${cleanName}`;
  const meta = await storage().put(storageKey, buf, file.type);

  const [row] = await db
    .insert(lessonFiles)
    .values({
      userId,
      lessonId,
      kind,
      storageKey,
      filename: file.name,
      contentType: file.type,
      sizeBytes: meta.size,
    })
    .returning();

  return NextResponse.json(
    {
      id: row.id,
      kind: row.kind,
      filename: row.filename,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      url: meta.url,
      createdAt: row.createdAt,
    },
    { status: 201 },
  );
}
