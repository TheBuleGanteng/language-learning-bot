import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { userSettings } from '@/db/schema';
import { auth } from '@/lib/auth';
import { resolveApiKey, type Provider } from '@/lib/api-keys';
import { isExtractionProvider, isValidExtractionModel } from '@/lib/extraction';
import { isImageProvider } from '@/lib/image-gen';

/**
 * Pre-flight key check for the no-key flow (item 1). Returns whether a usable
 * key (personal OR eligible global, via resolveApiKey) resolves for the user's
 * configured provider for a given feature — WITHOUT ever returning the key.
 *
 *   GET /api/keys/status?feature=extraction|image
 *     → { feature, provider, configured, hasKey }
 */
export async function GET(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const feature = new URL(req.url).searchParams.get('feature');
  if (feature !== 'extraction' && feature !== 'image') {
    return NextResponse.json({ error: 'Unknown feature' }, { status: 400 });
  }

  const [s] = await db
    .select({
      extractionProvider: userSettings.extractionProvider,
      extractionModel: userSettings.extractionModel,
      imageProvider: userSettings.imageProvider,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  let provider: string | null = null;
  let configured = false;
  if (s) {
    if (feature === 'extraction') {
      provider = s.extractionProvider;
      configured =
        isExtractionProvider(provider) && isValidExtractionModel(provider, s.extractionModel);
    } else {
      provider = s.imageProvider;
      configured = isImageProvider(provider);
    }
  }

  let hasKey = false;
  if (configured && provider) {
    const resolved = await resolveApiKey(userId, provider as Provider);
    hasKey = !!resolved.key;
  }

  return NextResponse.json({ feature, provider, configured, hasKey });
}
