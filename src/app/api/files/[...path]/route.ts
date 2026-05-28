import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { LocalStorageProvider, storage } from '@/lib/storage';

/**
 * Local-storage streaming route. Only used when STORAGE_DRIVER=local —
 * GCS uses signed URLs directly. Auth-checks that the requested key
 * is owned by the current user via the `users/{userId}/...` prefix.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { path } = await ctx.params;
  // URL segments are decoded by Next.js
  const key = path.join('/');

  // Ownership check: key MUST live under users/{userId}/...
  if (!key.startsWith(`users/${userId}/`)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const provider = storage();
  if (!(provider instanceof LocalStorageProvider)) {
    return NextResponse.json(
      { error: 'File route only used by local storage driver' },
      { status: 500 },
    );
  }

  try {
    const stat = await provider.stat(key);
    const buf = await provider.read(key);
    // Crude content-type sniff based on extension — local dev is fine.
    const ext = key.split('.').pop()?.toLowerCase() ?? '';
    const contentType =
      ext === 'pdf'
        ? 'application/pdf'
        : ext === 'mp3'
          ? 'audio/mpeg'
          : ext === 'm4a'
            ? 'audio/mp4'
            : ext === 'wav'
              ? 'audio/wav'
              : ext === 'ogg'
                ? 'audio/ogg'
                : 'application/octet-stream';
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(stat.size),
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, max-age=0, must-revalidate',
      },
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (err instanceof Error && err.message === 'Path traversal rejected') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    throw err;
  }
}
