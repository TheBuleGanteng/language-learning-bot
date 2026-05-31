import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { userSettings } from '@/db/schema';
import { apiUser } from '@/lib/api-auth';
import { decryptString } from '@/lib/crypto';
import { checkSpendLimits } from '@/lib/cost-tracking';

/**
 * GET /api/avatar/session-config — returns the user's own OpenAI key (for the
 * browser Realtime client) plus spend-limit gating.
 *
 * Security: returning the key is acceptable because it is the user's own key.
 * It is never logged here.
 */
export async function GET() {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [s] = await db
    .select({ openai: userSettings.openaiApiKeyEncrypted })
    .from(userSettings)
    .where(eq(userSettings.userId, user.id))
    .limit(1);

  let openaiApiKey: string | null = null;
  if (s?.openai) {
    try {
      openaiApiKey = decryptString(s.openai);
    } catch {
      openaiApiKey = null;
    }
  }
  if (!openaiApiKey) {
    return NextResponse.json({ error: 'no_openai_key' }, { status: 402 });
  }

  const limits = await checkSpendLimits(user.id);
  if (limits.hardStopTriggered) {
    return NextResponse.json(
      {
        error: 'hard_stop',
        monthlySpend: limits.monthlySpend,
        hardStopLimit: limits.hardStopLimit,
      },
      { status: 402 },
    );
  }

  if (limits.warningTriggered) {
    return NextResponse.json({
      openaiApiKey,
      warning: true,
      monthlySpend: limits.monthlySpend,
      warningLimit: limits.warningLimit,
    });
  }

  return NextResponse.json({ openaiApiKey });
}
