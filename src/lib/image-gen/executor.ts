import { randomUUID } from 'crypto';
import { and, eq, inArray, sql, lt } from 'drizzle-orm';
import { db } from '@/db';
import {
  imageGenerationBatches,
  userSettings,
  users,
  vocabItems,
} from '@/db/schema';
import { storage } from '@/lib/storage';
import { resolveApiKey } from '@/lib/api-keys';
import { languageName } from '@/lib/languages';
import {
  HardStopExceededError,
  checkAndRecordReminderBand,
  enforceHardStop,
  logSpend,
  type ReminderBandCrossed,
} from '@/lib/cost-tracking';
import { buildImagePrompt } from './prompt';
import { makeImageProvider } from './index';
import { imageModelCost, isImageProvider } from './catalog';
import type { ImageGenResult, ImageProviderId } from './types';

const CONCURRENCY = 2;
/** Items still 'generating' after this go back to 'none' on read. */
const STALE_GENERATING_MS = 5 * 60_000;

interface BatchState {
  userId: string;
  total: number;
  completed: number;
  failed: number;
  refused: number;
  startedAt: number;
  cancelled: boolean;
  bandReminders: ReminderBandCrossed[];
  hardStopHitAfter: number; // count of items processed before hard stop hit
}

const BATCHES = new Map<string, BatchState>();

export function getBatchForUser(userId: string): BatchState | null {
  for (const b of BATCHES.values()) {
    if (b.userId === userId && b.completed + b.failed + b.refused < b.total && !b.cancelled) {
      return b;
    }
  }
  return null;
}

export function cancelBatchForUser(userId: string): boolean {
  for (const b of BATCHES.values()) {
    if (b.userId === userId) {
      b.cancelled = true;
      return true;
    }
  }
  return false;
}

/** Reset items that have been 'generating' for too long — process must have died. */
export async function resetStaleGenerating(userId: string): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_GENERATING_MS);
  await db
    .update(vocabItems)
    .set({ imageStatus: 'none', updatedAt: new Date() })
    .where(
      and(
        eq(vocabItems.userId, userId),
        eq(vocabItems.imageStatus, 'generating'),
        lt(vocabItems.updatedAt, cutoff),
      ),
    );
}

interface UserImageConfig {
  provider: ImageProviderId;
  model: string;
  apiKey: string;
  targetLanguageName: string;
  hardStop: number;
}

async function loadUserConfig(userId: string): Promise<UserImageConfig | null> {
  const [s] = await db
    .select({
      provider: userSettings.imageProvider,
      model: userSettings.imageModel,
      hardStop: userSettings.aiSpendHardStopUsd,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  if (!s) return null;

  if (!isImageProvider(s.provider)) return null;
  const provider = s.provider;
  // Resolve the provider key: personal → eligible global → none.
  const resolved = await resolveApiKey(userId, provider);
  if (!resolved.key) return null;
  const apiKey = resolved.key;

  const [u] = await db
    .select({ target: users.targetLanguage })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const targetLanguageName = languageName(u?.target ?? 'th');

  return {
    provider,
    model: s.model,
    apiKey,
    targetLanguageName,
    hardStop: Number(s.hardStop ?? 100),
  };
}

interface GenerateOneResult {
  status: 'success' | 'refused' | 'failed' | 'cancelled' | 'hard_stop';
  bandCrossed?: ReminderBandCrossed | null;
}

/**
 * Generate one image for a vocab item. Public so the single-item /generate
 * API route can reuse this end-to-end.
 */
export async function generateImageForVocabItem(
  userId: string,
  vocabItemId: string,
): Promise<GenerateOneResult> {
  const cfg = await loadUserConfig(userId);
  if (!cfg) {
    await markFailure(vocabItemId);
    return { status: 'failed' };
  }

  const cost = imageModelCost(cfg.provider, cfg.model);
  try {
    await enforceHardStop(userId, cost);
  } catch (err) {
    if (err instanceof HardStopExceededError) {
      // Revert any tentative 'generating' state on this row
      await db
        .update(vocabItems)
        .set({ imageStatus: 'none', updatedAt: new Date() })
        .where(
          and(
            eq(vocabItems.id, vocabItemId),
            eq(vocabItems.userId, userId),
            eq(vocabItems.imageStatus, 'generating'),
          ),
        );
      return { status: 'hard_stop' };
    }
    throw err;
  }

  const [item] = await db
    .select()
    .from(vocabItems)
    .where(and(eq(vocabItems.id, vocabItemId), eq(vocabItems.userId, userId)))
    .limit(1);
  if (!item) return { status: 'failed' };

  const prompt = buildImagePrompt({
    nativeText: item.nativeText,
    targetLanguageName: cfg.targetLanguageName,
    override: item.imagePromptOverride,
  });

  const provider = makeImageProvider({
    provider: cfg.provider,
    model: cfg.model,
    apiKey: cfg.apiKey,
  });

  let result: ImageGenResult;
  try {
    result = await provider.generate({ prompt });
  } catch (err) {
    result = {
      status: 'failed',
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }

  // Log billable spend before mutating the vocab row so cost tracking
  // survives a later storage failure. Only success + refused are billed (the
  // provider still charges for a refusal); an outright failed call is not.
  if (result.status === 'success' || result.status === 'refused') {
    await logSpend(userId, 'image_gen', cost, `${cfg.provider} ${cfg.model} 1 image`);
  }

  if (result.status === 'success' && result.imageBuffer) {
    // If a previous image exists, delete it (regenerate semantics).
    if (item.imageStorageKey) {
      await storage().delete(item.imageStorageKey).catch(() => {});
    }
    const key = `public/users/${userId}/vocab/${vocabItemId}/${randomUUID()}.png`;
    try {
      await storage().putPublic(key, result.imageBuffer, 'image/png');
    } catch {
      await markFailure(vocabItemId);
      return { status: 'failed' };
    }
    await db
      .update(vocabItems)
      .set({
        imageStorageKey: key,
        imageStatus: 'completed',
        imageGeneratedAt: new Date(),
        imagePrompt: prompt,
        imageProvider: cfg.provider,
        imageModel: cfg.model,
        updatedAt: new Date(),
      })
      .where(eq(vocabItems.id, vocabItemId));
    const bandCrossed = await checkAndRecordReminderBand(userId);
    return { status: 'success', bandCrossed };
  }

  await db
    .update(vocabItems)
    .set({
      imageStatus: result.status === 'refused' ? 'refused' : 'failed',
      updatedAt: new Date(),
    })
    .where(eq(vocabItems.id, vocabItemId));
  const bandCrossed = await checkAndRecordReminderBand(userId);
  return { status: result.status, bandCrossed };
}

async function markFailure(vocabItemId: string): Promise<void> {
  await db
    .update(vocabItems)
    .set({ imageStatus: 'failed', updatedAt: new Date() })
    .where(eq(vocabItems.id, vocabItemId));
}

/**
 * Start a background batch. Marks all rows 'generating' then returns
 * immediately. The actual provider calls happen in a fire-and-forget
 * loop tracked in the BATCHES map AND in the image_generation_batches
 * table (source of truth for cross-page completion notifications).
 */
export async function startBatch(
  userId: string,
  vocabIds: string[],
): Promise<{ batchId: string; total: number }> {
  // Filter to items actually owned by this user that aren't already generating
  const owned = await db
    .select({ id: vocabItems.id })
    .from(vocabItems)
    .where(
      and(
        eq(vocabItems.userId, userId),
        inArray(vocabItems.id, vocabIds),
      ),
    );
  const ids = owned.map((r) => r.id);
  if (ids.length === 0) {
    return { batchId: '', total: 0 };
  }

  await db
    .update(vocabItems)
    .set({ imageStatus: 'generating', updatedAt: new Date() })
    .where(
      and(
        eq(vocabItems.userId, userId),
        inArray(vocabItems.id, ids),
      ),
    );

  // Persist the batch row first so its UUID can drive both the in-process
  // state and any cross-page polling that arrives mid-batch.
  const [row] = await db
    .insert(imageGenerationBatches)
    .values({ userId, requestedCount: ids.length })
    .returning({ id: imageGenerationBatches.id });
  const batchId = row.id;

  const state: BatchState = {
    userId,
    total: ids.length,
    completed: 0,
    failed: 0,
    refused: 0,
    startedAt: Date.now(),
    cancelled: false,
    bandReminders: [],
    hardStopHitAfter: -1,
  };
  BATCHES.set(batchId, state);

  // Fire and forget — no await
  void runBatch(batchId, ids, state);

  return { batchId, total: ids.length };
}

async function runBatch(
  batchId: string,
  vocabIds: string[],
  state: BatchState,
): Promise<void> {
  let cursor = 0;

  /**
   * Mirror the in-memory counters to the batches row. Cheap UPDATEs (single
   * indexed PK lookup) and they run in the worker's gap between API calls,
   * so the polling endpoint never has to read in-memory state.
   */
  async function persistCounts() {
    await db
      .update(imageGenerationBatches)
      .set({
        succeededCount: state.completed,
        failedCount: state.failed,
        refusedCount: state.refused,
      })
      .where(eq(imageGenerationBatches.id, batchId));
  }

  async function worker() {
    while (cursor < vocabIds.length) {
      if (state.cancelled) {
        // Reset still-queued items so they're not stuck on 'generating'.
        const remaining = vocabIds.slice(cursor);
        if (remaining.length > 0) {
          await db
            .update(vocabItems)
            .set({ imageStatus: 'none', updatedAt: new Date() })
            .where(
              and(
                eq(vocabItems.userId, state.userId),
                inArray(vocabItems.id, remaining),
                eq(vocabItems.imageStatus, 'generating'),
              ),
            );
        }
        return;
      }
      const i = cursor++;
      const id = vocabIds[i];
      if (!id) return;
      try {
        const r = await generateImageForVocabItem(state.userId, id);
        if (r.status === 'success') state.completed += 1;
        else if (r.status === 'refused') state.refused += 1;
        else if (r.status === 'hard_stop') {
          if (state.hardStopHitAfter < 0) state.hardStopHitAfter = state.completed + state.failed + state.refused;
          state.failed += 1;
          state.cancelled = true; // stop the rest
        } else state.failed += 1;
        if (r.bandCrossed) state.bandReminders.push(r.bandCrossed);
        await persistCounts();
      } catch {
        state.failed += 1;
        await persistCounts();
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);

  // Final counts + finish marker.
  await db
    .update(imageGenerationBatches)
    .set({
      succeededCount: state.completed,
      failedCount: state.failed,
      refusedCount: state.refused,
      stopped: state.cancelled,
      finishedAt: new Date(),
    })
    .where(eq(imageGenerationBatches.id, batchId));

  // Keep finished in-memory state around for a minute so the vocab page's
  // own status poll can see the totals before they disappear.
  setTimeout(() => BATCHES.delete(batchId), 60_000);
}

/** Snapshot read for the polling endpoint. */
export function getBatchStatusForUser(userId: string) {
  const b = getBatchForUser(userId);
  if (!b) return null;
  const done = b.completed + b.failed + b.refused;
  return {
    total: b.total,
    completed: b.completed,
    failed: b.failed,
    refused: b.refused,
    done,
    inFlight: done < b.total && !b.cancelled,
    cancelled: b.cancelled,
    bandReminders: b.bandReminders,
    hardStopHit: b.hardStopHitAfter >= 0,
  };
}

void sql; // keep import to silence "unused" warnings if any
