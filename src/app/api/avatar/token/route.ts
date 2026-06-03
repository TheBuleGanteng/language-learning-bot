import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { userSettings } from '@/db/schema';
import { auth } from '@/lib/auth';
import { decryptString } from '@/lib/crypto';
import { checkSpendLimits } from '@/lib/cost-tracking';
import { isVoiceModel, defaultVoiceModel } from '@/lib/voice-models';

const VOICE = 'alloy';

/**
 * POST /api/avatar/token — GA Realtime handshake step 1 (server-side).
 * Exchanges the user's encrypted OpenAI key for a short-lived ephemeral token
 * so the raw key never reaches the browser.
 */
export async function POST() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Check spend limits first.
  const limits = await checkSpendLimits(userId);
  if (limits.hardStopTriggered) {
    return NextResponse.json({ error: 'hard_stop' }, { status: 402 });
  }

  // Get the user's OpenAI key + their selected voice model.
  const [settings] = await db
    .select({
      openaiKey: userSettings.openaiApiKeyEncrypted,
      voiceModel: userSettings.voiceModel,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  if (!settings?.openaiKey) {
    return NextResponse.json({ error: 'no_openai_key' }, { status: 402 });
  }

  // Apply the user's choice; fall back to the default if unset/invalid. The
  // model is bound to the ephemeral token, so this is the only place to set it.
  const model =
    settings.voiceModel && isVoiceModel(settings.voiceModel)
      ? settings.voiceModel
      : defaultVoiceModel();

  let apiKey: string;
  try {
    apiKey = decryptString(settings.openaiKey);
  } catch {
    return NextResponse.json({ error: 'key_decrypt_failed' }, { status: 500 });
  }

  // Exchange for an ephemeral token server-side.
  try {
    const tokenRes = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ session: { type: "realtime", model, audio: { output: { voice: VOICE } } } }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error('OpenAI client_secrets error:', tokenRes.status, errBody);
      return NextResponse.json(
        { error: 'openai_error', status: tokenRes.status },
        { status: 502 },
      );
    }

    const data = await tokenRes.json();
    const ephemeralToken = data?.value;
    if (!ephemeralToken) {
      return NextResponse.json({ error: 'no_token' }, { status: 502 });
    }

    // Return only the ephemeral token — never the raw API key.
    return NextResponse.json({
      ephemeralToken,
      model,
      warning: limits.warningTriggered
        ? {
            monthlySpend: limits.monthlySpend,
            warningLimit: limits.warningLimit,
          }
        : undefined,
    });
  } catch (err) {
    console.error('Token exchange error:', err);
    return NextResponse.json({ error: 'token_exchange_failed' }, { status: 500 });
  }
}
