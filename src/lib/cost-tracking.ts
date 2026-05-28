import { and, eq, gte, ne, sql } from 'drizzle-orm';
import { db } from '@/db';
import { imageGenerationLog, userSettings } from '@/db/schema';

/** UTC year-month prefix used in user_settings.image_spend_last_reminder_at. */
export function currentMonthPrefix(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function currentMonthLabel(now: Date = new Date()): string {
  return now.toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Sum of estimatedCostUsd for this user's image_generation_log rows in the
 * current UTC calendar month. Excludes outright `failed` calls (we didn't
 * actually get a billable result); includes `refused` (the provider still
 * billed for the API call) and `success`.
 */
export async function getMonthToDateImageSpend(userId: string): Promise<number> {
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const result = await db
    .select({
      total: sql<string>`COALESCE(SUM(${imageGenerationLog.estimatedCostUsd}), 0)::text`,
    })
    .from(imageGenerationLog)
    .where(
      and(
        eq(imageGenerationLog.userId, userId),
        gte(imageGenerationLog.createdAt, monthStart),
        ne(imageGenerationLog.status, 'failed'),
      ),
    );
  return Number(result[0]?.total ?? 0);
}

export class HardStopExceededError extends Error {
  readonly currentSpend: number;
  readonly hardStop: number;

  constructor(currentSpend: number, hardStop: number) {
    super(
      `Image generation blocked: monthly hard stop ($${hardStop.toFixed(2)}) reached. ` +
        `Current spend: $${currentSpend.toFixed(2)}.`,
    );
    this.name = 'HardStopExceededError';
    this.currentSpend = currentSpend;
    this.hardStop = hardStop;
  }
}

/**
 * Throws HardStopExceededError if `spend + costToAdd` would exceed the user's
 * configured hard stop. Pass `costToAdd = 0` to check current state.
 */
export async function enforceHardStop(
  userId: string,
  costToAdd: number,
): Promise<{ currentSpend: number; hardStop: number }> {
  const [row] = await db
    .select({ hardStop: userSettings.imageSpendHardStopUsd })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  const hardStop = Number(row?.hardStop ?? 100);
  const currentSpend = await getMonthToDateImageSpend(userId);
  if (currentSpend + costToAdd > hardStop) {
    throw new HardStopExceededError(currentSpend, hardStop);
  }
  return { currentSpend, hardStop };
}

/**
 * Parse "YYYY-MM:amount" into its parts. Returns null if the prefix doesn't
 * match the current month (i.e., the stored band is from a previous month
 * and should be treated as zero).
 */
function parseLastReminderForCurrentMonth(
  raw: string | null,
  now: Date = new Date(),
): number {
  if (!raw) return 0;
  const [prefix, amountStr] = raw.split(':');
  if (prefix !== currentMonthPrefix(now)) return 0;
  const amount = Number(amountStr ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export interface ReminderBandCrossed {
  band: number;
  currentSpend: number;
}

/**
 * If the user has crossed into a new reminder band this month (e.g., from
 * <$25 to >=$25), record it and return the new band. Otherwise return null.
 * Idempotent: calling again within the same band is a no-op.
 */
export async function checkAndRecordReminderBand(
  userId: string,
): Promise<ReminderBandCrossed | null> {
  const [row] = await db
    .select({
      reminder: userSettings.imageSpendReminderUsd,
      last: userSettings.imageSpendLastReminderAt,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  if (!row) return null;

  const reminder = Number(row.reminder ?? 25);
  if (reminder <= 0) return null;

  const spend = await getMonthToDateImageSpend(userId);
  const currentBand = Math.floor(spend / reminder) * reminder;
  const lastBand = parseLastReminderForCurrentMonth(row.last);

  if (currentBand > lastBand && currentBand > 0) {
    const stamp = `${currentMonthPrefix()}:${currentBand.toFixed(2)}`;
    await db
      .update(userSettings)
      .set({ imageSpendLastReminderAt: stamp })
      .where(eq(userSettings.userId, userId));
    return { band: currentBand, currentSpend: spend };
  }
  return null;
}

export interface ImageSpendSnapshot {
  currentSpend: number;
  hardStop: number;
  reminder: number;
  lastReminderBand: number;
  nextReminderBand: number;
  monthLabel: string;
}

/**
 * Single-trip read of all numeric values the UI needs for the spend banner.
 * The settings page composes this with provider/model info from /api/settings.
 */
export async function getImageSpendSnapshot(userId: string): Promise<ImageSpendSnapshot> {
  const [row] = await db
    .select({
      reminder: userSettings.imageSpendReminderUsd,
      hardStop: userSettings.imageSpendHardStopUsd,
      last: userSettings.imageSpendLastReminderAt,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  const reminder = Number(row?.reminder ?? 25);
  const hardStop = Number(row?.hardStop ?? 100);
  const lastReminderBand = parseLastReminderForCurrentMonth(row?.last ?? null);
  const currentSpend = await getMonthToDateImageSpend(userId);
  const nextReminderBand =
    reminder > 0 ? (Math.floor(currentSpend / reminder) + 1) * reminder : 0;

  return {
    currentSpend,
    hardStop,
    reminder,
    lastReminderBand,
    nextReminderBand,
    monthLabel: currentMonthLabel(),
  };
}
