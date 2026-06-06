import { NextResponse } from 'next/server';
import convert from 'heic-convert';
import { auth } from '@/lib/auth';

// Max accepted HEIC upload. iPhone HEICs are typically 1–4MB; cap generously.
const MAX_HEIC_BYTES = 25 * 1024 * 1024;

/**
 * Magic-byte HEIC/HEIF detection (ISO-BMFF `ftyp` box brand). We never trust
 * the client content-type — mirrors the sniff used by the lesson-photos upload
 * route so behaviour is consistent across the app.
 */
function isHeic(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  if (buf.toString('ascii', 4, 8) !== 'ftyp') return false;
  const brand = buf.toString('ascii', 8, 12);
  const heicBrands = new Set([
    'heic', 'heix', 'heim', 'heis', 'hevc', 'hevm', 'hevs', 'mif1', 'msf1', 'heif',
  ]);
  return heicBrands.has(brand);
}

/**
 * Convert a single HEIC/HEIF image to JPEG and return the raw JPEG bytes.
 *
 * Browsers other than Safari cannot decode HEIC on a canvas, so the camera /
 * multi-photo staging flow routes HEIC gallery picks through here to get a
 * JPEG, then downscales client-side (see `src/lib/image/normalize.ts`). This
 * reuses the same `heic-convert` dependency as the lesson-photos upload path;
 * it does NOT store anything — it's a pure transform.
 */
export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 });
  }
  if (file.size > MAX_HEIC_BYTES) {
    return NextResponse.json({ error: 'Image too large' }, { status: 413 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (!isHeic(buf)) {
    return NextResponse.json({ error: 'Not a HEIC/HEIF image' }, { status: 400 });
  }

  try {
    const out = await convert({ buffer: buf, format: 'JPEG', quality: 0.92 });
    const body = Buffer.from(out);
    return new NextResponse(body as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(body.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('HEIC conversion failed:', err);
    return NextResponse.json({ error: 'Could not convert this HEIC photo' }, { status: 422 });
  }
}
