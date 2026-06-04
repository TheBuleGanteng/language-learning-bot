import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users, userSettings } from '@/db/schema';
import { auth } from '@/lib/auth';
import { decryptString } from '@/lib/crypto';
import { normalizeLanguageCode, languageName } from '@/lib/languages';
import { translateText } from '@/lib/translation';
import { romanizeText } from '@/lib/romanize';
import {
  romanizationModelProvider,
  romanizationModelCostPer1kChars,
  defaultRomanizationModel,
  isRomanizationModel,
} from '@/lib/romanization-models';
import { enforceHardStop, logSpend, HardStopExceededError } from '@/lib/cost-tracking';
import type { Provider } from '@/lib/models';

const schema = z.object({
  text: z.string().min(1).max(2000),
  mode: z.enum(['base', 'target', 'target_romanized']),
  speaker: z.enum(['tutor', 'user']),
});

// Maps a provider to the aliased column selected below.
const KEY_ALIAS: Record<Provider, 'anth' | 'openai' | 'gemini'> = {
  anthropic: 'anth',
  openai: 'openai',
  google: 'gemini',
};

/**
 * POST /api/avatar/caption-transform — transform one finalized caption line.
 * Behaviour is decided by (speaker, mode), matching the rendering table:
 *
 *   mode              tutor's line                 user's input
 *   ----------------  ---------------------------  ------------------------------
 *   target            (passthrough — never calls)  translate → target script (Google)
 *   target_romanized  romanize → Latin (LLM)       translate→target (Google) then romanize (LLM)
 *   base              translate → base (Google)     translate → base (Google)
 *
 * The tutor's line is always the target language, so its translations use a
 * known source; the user may speak either language, so theirs auto-detect the
 * source. Google translation is an app-level cost (NOT logged). The LLM
 * romanization is billed to ai_spend_log and subject to the hard stop.
 */
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
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }
  const { text, mode, speaker } = parsed.data;

  const [u] = await db
    .select({
      targetLanguage: users.targetLanguage,
      nativeLanguage: users.nativeLanguage,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const targetCode = normalizeLanguageCode(u?.targetLanguage);
  const baseCode = normalizeLanguageCode(u?.nativeLanguage);

  // --- Google translation only (no spend tracking): 'base' for either speaker,
  // and 'target' for the user (the tutor's 'target' line is a client-side
  // passthrough and never calls this route). ---
  if (mode === 'base' || mode === 'target') {
    const to = mode === 'base' ? baseCode : targetCode;
    // The tutor always speaks the target language, so its source is known; the
    // user may speak either language, so let Google auto-detect (omit source).
    const from = speaker === 'tutor' ? targetCode : undefined;
    try {
      const translated = await translateText(text, to, from);
      return NextResponse.json({ text: translated });
    } catch (err) {
      console.error('caption translate error:', err instanceof Error ? err.message : err);
      return NextResponse.json({ error: 'translate_failed' }, { status: 502 });
    }
  }

  // --- target_romanized: user's LLM (billed + hard-stop enforced). The tutor's
  // line is already the target language; the user's line is first translated to
  // the target language (Google, app-level) so the romanizer always receives
  // target-language text. ---
  let toRomanize = text;
  if (speaker === 'user') {
    try {
      toRomanize = await translateText(text, targetCode);
    } catch (err) {
      console.error('caption romanize-translate error:', err instanceof Error ? err.message : err);
      return NextResponse.json({ error: 'translate_failed' }, { status: 502 });
    }
  }

  const [s] = await db
    .select({
      romanizationModel: userSettings.romanizationModel,
      anth: userSettings.anthropicApiKeyEncrypted,
      openai: userSettings.openaiApiKeyEncrypted,
      gemini: userSettings.geminiApiKeyEncrypted,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  const model = s && isRomanizationModel(s.romanizationModel)
    ? s.romanizationModel
    : defaultRomanizationModel();
  const provider = romanizationModelProvider(model);
  const encrypted = s?.[KEY_ALIAS[provider]] ?? null;
  if (!encrypted) {
    return NextResponse.json({ error: 'no_key' }, { status: 400 });
  }
  let apiKey: string;
  try {
    apiKey = decryptString(encrypted);
  } catch {
    return NextResponse.json({ error: 'key_decrypt_failed' }, { status: 500 });
  }

  // Estimate cost from the (possibly translated) text length and enforce the
  // hard stop before spending.
  const estCost = (toRomanize.length / 1000) * romanizationModelCostPer1kChars(model);
  try {
    await enforceHardStop(userId, estCost);
  } catch (err) {
    if (err instanceof HardStopExceededError) {
      return NextResponse.json({ error: 'hard_stop' }, { status: 402 });
    }
    throw err;
  }

  try {
    const romanized = await romanizeText({
      provider,
      model,
      apiKey,
      text: toRomanize,
      targetLanguageName: languageName(targetCode) || 'the target language',
    });
    // Bill it like the other LLM features (counts toward the global monthly cap).
    await logSpend(userId, 'avatar', estCost, `caption romanization (${model})`);
    return NextResponse.json({ text: romanized || toRomanize });
  } catch (err) {
    console.error('caption romanize error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'romanize_failed' }, { status: 502 });
  }
}
