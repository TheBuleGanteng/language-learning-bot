import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/db';
import { aiSpendLog, userSettings } from '@/db/schema';

export type AiFeature = 'image_gen' | 'avatar';

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

function monthStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Total USD spent by this user in the current UTC calendar month across ALL AI
 * features (image generation + avatar). Only billable rows are written to
 * ai_spend_log, so this is a straight SUM.
 */
export async function getMonthlySpend(userId: string): Promise<number> {
  const result = await db
    .select({
      total: sql<string>`COALESCE(SUM(${aiSpendLog.costUsd}), 0)::text`,
    })
    .from(aiSpendLog)
    .where(and(eq(aiSpendLog.userId, userId), gte(aiSpendLog.createdAt, monthStart())));
  return Number(result[0]?.total ?? 0);
}

/** Record a billable AI spend event. */
export async function logSpend(
  userId: string,
  feature: AiFeature,
  costUsd: number,
  description: string,
): Promise<void> {
  await db.insert(aiSpendLog).values({
    userId,
    feature,
    costUsd: costUsd.toFixed(6),
    description: description.slice(0, 200),
  });
}

export interface SpendLimitStatus {
  underLimit: boolean;
  warningTriggered: boolean;
  hardStopTriggered: boolean;
  monthlySpend: number;
  warningLimit: number;
  hardStopLimit: number;
}

/**
 * Evaluate the user's current spend against their configured caps.
 * - hardStopTriggered: at or above the hard stop (block new spend)
 * - warningTriggered: at or above the reminder threshold but below hard stop
 */
export async function checkSpendLimits(userId: string): Promise<SpendLimitStatus> {
  const [row] = await db
    .select({
      reminder: userSettings.aiSpendReminderUsd,
      hardStop: userSettings.aiSpendHardStopUsd,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  const warningLimit = Number(row?.reminder ?? 25);
  const hardStopLimit = Number(row?.hardStop ?? 100);
  const monthlySpend = await getMonthlySpend(userId);
  const hardStopTriggered = monthlySpend >= hardStopLimit;
  return {
    underLimit: !hardStopTriggered,
    warningTriggered: !hardStopTriggered && warningLimit > 0 && monthlySpend >= warningLimit,
    hardStopTriggered,
    monthlySpend,
    warningLimit,
    hardStopLimit,
  };
}

export class HardStopExceededError extends Error {
  readonly currentSpend: number;
  readonly hardStop: number;

  constructor(currentSpend: number, hardStop: number) {
    super(
      `AI spend blocked: monthly hard stop ($${hardStop.toFixed(2)}) reached. ` +
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
    .select({ hardStop: userSettings.aiSpendHardStopUsd })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  const hardStop = Number(row?.hardStop ?? 100);
  const currentSpend = await getMonthlySpend(userId);
  if (currentSpend + costToAdd > hardStop) {
    throw new HardStopExceededError(currentSpend, hardStop);
  }
  return { currentSpend, hardStop };
}

/**
 * Parse "YYYY-MM:amount" into its amount, treating a stale (previous-month)
 * prefix as zero.
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
 * If the user has crossed into a new reminder band this month, record it and
 * return the new band. Idempotent within a band.
 */
export async function checkAndRecordReminderBand(
  userId: string,
): Promise<ReminderBandCrossed | null> {
  const [row] = await db
    .select({
      reminder: userSettings.aiSpendReminderUsd,
      last: userSettings.imageSpendLastReminderAt,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  if (!row) return null;

  const reminder = Number(row.reminder ?? 25);
  if (reminder <= 0) return null;

  const spend = await getMonthlySpend(userId);
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

export interface SpendSnapshot {
  currentSpend: number;
  hardStop: number;
  reminder: number;
  lastReminderBand: number;
  nextReminderBand: number;
  monthLabel: string;
}

/** Single-trip read of all numeric values the spend UI needs. */
export async function getSpendSnapshot(userId: string): Promise<SpendSnapshot> {
  const [row] = await db
    .select({
      reminder: userSettings.aiSpendReminderUsd,
      hardStop: userSettings.aiSpendHardStopUsd,
      last: userSettings.imageSpendLastReminderAt,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  const reminder = Number(row?.reminder ?? 25);
  const hardStop = Number(row?.hardStop ?? 100);
  const lastReminderBand = parseLastReminderForCurrentMonth(row?.last ?? null);
  const currentSpend = await getMonthlySpend(userId);
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
