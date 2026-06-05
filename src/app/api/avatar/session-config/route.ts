import { NextResponse } from 'next/server';
import { apiUser } from '@/lib/api-auth';
import { providerKeyStatus } from '@/lib/api-keys';
import { checkSpendLimits } from '@/lib/cost-tracking';

/**
 * GET /api/avatar/session-config — page-load pre-check for the avatar page.
 * Reports whether the user has an OpenAI key and their spend-limit status, but
 * NEVER returns the key itself. The raw key stays server-side; the browser gets
 * a short-lived ephemeral token from /api/avatar/token (on mic tap) instead.
 */
export async function GET() {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // A usable OpenAI key = personal OR an eligible global fallback.
  const status = await providerKeyStatus(user.id, 'openai');
  const hasKey = status.hasPersonalKey || status.usingGlobalKey;

  const limits = await checkSpendLimits(user.id);

  return NextResponse.json({
    hasKey,
    hardStopTriggered: limits.hardStopTriggered,
    hardStopLimit: limits.hardStopLimit,
    warningTriggered: limits.warningTriggered,
    monthlySpend: limits.monthlySpend,
    warningLimit: limits.warningLimit,
  });
}
