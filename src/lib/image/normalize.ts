// Client-side image normalization for the camera / multi-photo vocab capture
// flow. Every queued image is run through `normalizeImageToJpeg` before it is
// cropped or sent to extraction:
//
//   1. HEIC/HEIF (iPhone gallery) is converted to JPEG server-side — browsers
//      other than Safari can't decode HEIC on a canvas — via the dedicated
//      /api/images/heic-to-jpeg route (reuses the project's heic-convert dep).
//   2. EXIF orientation is baked in (so portrait phone photos aren't sideways)
//      by decoding with `imageOrientation: 'from-image'`.
//   3. The image is downscaled to ~2000px on the long edge and re-encoded to
//      JPEG (quality ~0.85). This keeps uploads well under the 50M nginx limit
//      and trims extraction cost. Camera shots and cropped outputs are already
//      JPEG but still pass through here for consistent orientation + size.

import { withBase } from '@/lib/base-path';

const HEIC_BRANDS = new Set([
  'heic', 'heix', 'heim', 'heis', 'hevc', 'hevm', 'hevs', 'mif1', 'msf1', 'heif',
]);

/** Sniff HEIC/HEIF by the ISO-BMFF `ftyp` box brand (don't trust the type). */
export async function isHeic(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (head.length < 12) return false;
  const ftyp = String.fromCharCode(head[4], head[5], head[6], head[7]);
  if (ftyp !== 'ftyp') return false;
  const brand = String.fromCharCode(head[8], head[9], head[10], head[11]);
  return HEIC_BRANDS.has(brand);
}

async function heicToJpeg(file: Blob): Promise<Blob> {
  const fd = new FormData();
  fd.append(
    'file',
    file instanceof File ? file : new File([file], 'photo.heic', { type: 'image/heic' }),
  );
  const res = await fetch(withBase('/api/images/heic-to-jpeg'), {
    method: 'POST',
    body: fd,
  });
  if (!res.ok) {
    const msg = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(msg?.error ?? 'Could not convert this HEIC photo');
  }
  return res.blob();
}

export interface NormalizeOptions {
  /** Max length of the long edge, in pixels. */
  maxEdge?: number;
  /** JPEG quality 0–1. */
  quality?: number;
}

/**
 * Normalize an arbitrary image Blob/File to an upright, downscaled JPEG Blob.
 * Throws if the image can't be decoded or encoded (caller marks the queue item
 * failed and lets the user remove it).
 */
export async function normalizeImageToJpeg(
  file: Blob,
  opts: NormalizeOptions = {},
): Promise<Blob> {
  const maxEdge = opts.maxEdge ?? 2000;
  const quality = opts.quality ?? 0.85;

  let source: Blob = file;
  if (await isHeic(file)) {
    source = await heicToJpeg(file);
  }

  // `from-image` bakes EXIF orientation into the decoded pixels, so the canvas
  // output is upright with no orientation metadata to misinterpret downstream.
  const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = longest > maxEdge ? maxEdge / longest : 1;
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is unavailable in this browser');
    ctx.drawImage(bitmap, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    );
    if (!blob) throw new Error('Could not encode the image');
    return blob;
  } finally {
    bitmap.close();
  }
}
