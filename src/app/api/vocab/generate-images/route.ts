import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { userSettings, vocabItems } from '@/db/schema';
import { auth } from '@/lib/auth';
import {
  HardStopExceededError,
  enforceHardStop,
  getMonthToDateImageSpend,
} from '@/lib/cost-tracking';
import {
  imageModelCost,
  isImageProvider,
  isValidImageModel,
} from '@/lib/image-gen';
import { resetStaleGenerating, startBatch } from '@/lib/image-gen/executor';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const schema = z.object({
  vocabIds: z.array(z.string().regex(UUID_RE)).min(1).max(2000),
});

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  await resetStaleGenerating(userId);

  // Validate ownership + figure out the batch size
  const owned = await db
    .select({ id: vocabItems.id })
    .from(vocabItems)
    .where(and(eq(vocabItems.userId, userId), inArray(vocabItems.id, parsed.data.vocabIds)));
  const ownedIds = owned.map((r) => r.id);

  // Read user's image model so we can price the batch
  const [s] = await db
    .select({
      provider: userSettings.imageProvider,
      model: userSettings.imageModel,
      hardStop: userSettings.imageSpendHardStopUsd,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  if (!s || !isImageProvider(s.provider) || !isValidImageModel(s.provider, s.model)) {
    return NextResponse.json(
      { error: 'Image provider/model not configured' },
      { status: 400 },
    );
  }

  const costPerImage = imageModelCost(s.provider, s.model);
  const totalCost = costPerImage * ownedIds.length;

  // Hard-stop pre-flight: how many of the requested items can fit?
  try {
    await enforceHardStop(userId, totalCost);
  } catch (err) {
    if (err instanceof HardStopExceededError) {
      const spend = await getMonthToDateImageSpend(userId);
      const remaining = Math.max(0, err.hardStop - spend);
      const affordable =
        costPerImage > 0 ? Math.max(0, Math.floor(remaining / costPerImage)) : 0;
      return NextResponse.json(
        {
          error: 'hard_stop_exceeded',
          message:
            "You've reached your monthly image-generation hard stop. " +
            'Raise it in Settings, or wait until the first of next month.',
          requestedCount: ownedIds.length,
          requestedCost: Number(totalCost.toFixed(2)),
          affordableCount: affordable,
          affordableCost: Number((affordable * costPerImage).toFixed(2)),
          currentSpend: err.currentSpend,
          hardStop: err.hardStop,
        },
        { status: 402 },
      );
    }
    throw err;
  }

  const { batchId, total } = await startBatch(userId, ownedIds);
  return NextResponse.json({ batchId, total }, { status: 202 });
}
