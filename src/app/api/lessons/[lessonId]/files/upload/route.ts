import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { and, eq, sql } from 'drizzle-orm';
import convert from 'heic-convert';
import { db } from '@/db';
import { lessons, lessonFiles } from '@/db/schema';
import { auth } from '@/lib/auth';
import { storage } from '@/lib/storage';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // per photo
const MAX_IMAGE_TOTAL_BYTES = 50 * 1024 * 1024; // per lesson, across all photos
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

type ImageKind = 'jpeg' | 'png' | 'webp' | 'gif' | 'heic' | null;

/**
 * Sniff the real image type from magic bytes (don't trust the client
 * content-type or extension). HEIC/HEIF is detected via the ISO-BMFF `ftyp`
 * box brand.
 */
function sniffImage(buf: Buffer): ImageKind {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'gif';
  if (
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'webp';
  if (buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12);
    const heicBrands = new Set([
      'heic', 'heix', 'heim', 'heis', 'hevc', 'hevm', 'hevs', 'mif1', 'msf1', 'heif',
    ]);
    if (heicBrands.has(brand)) return 'heic';
  }
  return null;
}

function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  return base.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
}

export async function POST(req: Request, ctx: { params: Promise<{ lessonId: string }> }) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { lessonId } = await ctx.params;
  if (!UUID_RE.test(lessonId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Ownership check — only the lesson owner may upload.
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
  const kind =
    kindRaw === 'pdf' || kindRaw === 'audio' || kindRaw === 'image' ? kindRaw : null;
  if (!kind) {
    return NextResponse.json({ error: 'kind must be "pdf", "audio", or "image"' }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 });
  }

  // ---- PDF / AUDIO: unchanged paths -------------------------------------
  if (kind === 'pdf') {
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDFs allowed' }, { status: 400 });
    }
    if (file.size > MAX_PDF_BYTES) {
      return NextResponse.json({ error: 'PDF exceeds 20MB' }, { status: 413 });
    }
  } else if (kind === 'audio') {
    if (!AUDIO_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'Unsupported audio format' }, { status: 400 });
    }
    if (file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: 'Audio exceeds 50MB' }, { status: 413 });
    }
  } else {
    // image — per-photo size checked here; total checked after we know the
    // stored (possibly converted) size below.
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'Photo exceeds 10MB' }, { status: 413 });
    }
  }

  let buf = Buffer.from(await file.arrayBuffer());
  let contentType = file.type;
  let filename = file.name;

  if (kind === 'image') {
    const detected = sniffImage(buf);
    if (!detected) {
      return NextResponse.json(
        { error: 'Unsupported image format. Use JPEG, PNG, WebP, GIF, or HEIC.' },
        { status: 400 },
      );
    }
    if (detected === 'heic') {
      // Browsers can't render HEIC — convert to JPEG and store that instead.
      try {
        const out = await convert({ buffer: buf, format: 'JPEG', quality: 0.9 });
        buf = Buffer.from(out);
        contentType = 'image/jpeg';
        filename = filename.replace(/\.(heic|heif)$/i, '') + '.jpg';
      } catch (err) {
        console.error('HEIC conversion failed:', err);
        return NextResponse.json({ error: 'Could not convert this HEIC photo' }, { status: 422 });
      }
    } else {
      contentType = `image/${detected === 'jpeg' ? 'jpeg' : detected}`;
    }

    // Per-lesson total cap across all of this user's photos in the lesson.
    const [{ total }] = await db
      .select({ total: sql<number>`coalesce(sum(${lessonFiles.sizeBytes}), 0)::bigint` })
      .from(lessonFiles)
      .where(
        and(
          eq(lessonFiles.lessonId, lessonId),
          eq(lessonFiles.userId, userId),
          eq(lessonFiles.kind, 'image'),
        ),
      );
    if (Number(total) + buf.length > MAX_IMAGE_TOTAL_BYTES) {
      return NextResponse.json(
        { error: 'Adding this photo would exceed the 50MB lesson photo limit' },
        { status: 413 },
      );
    }
  }

  const cleanName = safeFilename(filename);
  const storageKey = `users/${userId}/lessons/${lessonId}/${kind}/${randomUUID()}_${cleanName}`;
  const meta = await storage().put(storageKey, buf, contentType);

  const [row] = await db
    .insert(lessonFiles)
    .values({
      userId,
      lessonId,
      kind,
      storageKey,
      filename,
      contentType,
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
