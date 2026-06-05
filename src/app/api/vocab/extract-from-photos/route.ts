import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { userSettings } from '@/db/schema';
import { auth } from '@/lib/auth';
import { resolveApiKey } from '@/lib/api-keys';
import {
  isExtractionProvider,
  isValidExtractionModel,
  makeExtractor,
} from '@/lib/extraction';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGES = 10;
const SUPPORTED_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);

/**
 * Pure extraction call — does NOT save anything. Returns extracted rows for
 * the user to review + edit in the preview table, then a separate POST to
 * /api/vocab/save-extracted commits the chosen rows.
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

  const files = form.getAll('images').filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: 'No images uploaded' }, { status: 400 });
  }
  if (files.length > MAX_IMAGES) {
    return NextResponse.json(
      { error: `Too many images (max ${MAX_IMAGES})` },
      { status: 400 },
    );
  }
  for (const f of files) {
    if (!SUPPORTED_TYPES.has(f.type)) {
      return NextResponse.json(
        { error: `Unsupported image type: ${f.type || 'unknown'}` },
        { status: 400 },
      );
    }
    if (f.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: `Image exceeds 10MB: ${f.name}` },
        { status: 413 },
      );
    }
  }

  // Resolve the user's extraction provider/model + API key
  const [s] = await db
    .select({
      provider: userSettings.extractionProvider,
      model: userSettings.extractionModel,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  if (!s || !isExtractionProvider(s.provider) || !isValidExtractionModel(s.provider, s.model)) {
    return NextResponse.json(
      { error: 'Photo extraction provider / model not configured' },
      { status: 400 },
    );
  }

  // Resolve the provider key: personal → eligible global → none.
  const resolved = await resolveApiKey(userId, s.provider);
  if (!resolved.key) {
    return NextResponse.json(
      { error: `No API key for ${s.provider}. Add one in Settings to use this model.` },
      { status: 400 },
    );
  }
  const apiKey = resolved.key;

  // Convert each image to base64
  const imageBase64s: string[] = [];
  const imageMimeTypes: string[] = [];
  for (const f of files) {
    const buf = Buffer.from(await f.arrayBuffer());
    imageBase64s.push(buf.toString('base64'));
    imageMimeTypes.push(f.type === 'image/jpg' ? 'image/jpeg' : f.type);
  }

  const extractor = makeExtractor({
    provider: s.provider,
    model: s.model,
    apiKey,
  });

  const result = await extractor.extract({ imageBase64s, imageMimeTypes });

  if (result.status === 'success') {
    return NextResponse.json({
      status: 'success',
      rows: result.rows ?? [],
      provider: s.provider,
      model: s.model,
    });
  }

  return NextResponse.json(
    {
      status: result.status,
      error: result.errorMessage ?? 'Extraction failed',
    },
    { status: result.status === 'refused' ? 422 : 500 },
  );
}
