import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { userSettings } from '@/db/schema';
import { auth } from '@/lib/auth';
import { getImageSpendSnapshot } from '@/lib/cost-tracking';
import {
  imageModelCost,
  isImageProvider,
  isValidImageModel,
} from '@/lib/image-gen';

/**
 * Combined "image spend status" payload for the Settings page. Returns the
 * MTD spend, the user's configured reminder + hard-stop, and which provider/
 * model they have selected so the UI can show "X images possible at current
 * model price" without an extra round-trip.
 */
export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [settings] = await db
    .select({
      provider: userSettings.imageProvider,
      model: userSettings.imageModel,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  const provider = isImageProvider(settings?.provider ?? '')
    ? settings!.provider
    : 'google';
  const model = settings?.model ?? '';
  const estimatedCostPerImage =
    isImageProvider(provider) && isValidImageModel(provider, model)
      ? imageModelCost(provider, model)
      : 0;

  const snap = await getImageSpendSnapshot(userId);

  return NextResponse.json({
    ...snap,
    provider,
    model,
    estimatedCostPerImage,
  });
}
