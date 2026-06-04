import { v2 } from '@google-cloud/translate';

// Google Cloud Translation (v2). Authenticates via Application Default
// Credentials — it auto-reads GOOGLE_APPLICATION_CREDENTIALS (the same GCP
// service account used for GCS, granted the Cloud Translation API User role).
// No new credential or env var. This is an app-level cost (NOT user-incurred),
// so callers do NOT log it to ai_spend_log.

declare global {
  var __lang_translate_client__: v2.Translate | undefined;
}

function client(): v2.Translate {
  const existing = globalThis.__lang_translate_client__;
  if (existing) return existing;
  const c = new v2.Translate();
  globalThis.__lang_translate_client__ = c;
  return c;
}

/**
 * Translate `text` into `targetLangCode` (2-letter codes, e.g. 'en'). Pass
 * `sourceLangCode` when the source language is known (e.g. the tutor's line is
 * always the target language); omit it to let Google auto-detect the source
 * (the user may speak either their base or the target language). Returns the
 * translated string. Never logs the text.
 */
export async function translateText(
  text: string,
  targetLangCode: string,
  sourceLangCode?: string | null,
): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return text;
  // No-op when a known source equals the destination.
  if (sourceLangCode && sourceLangCode === targetLangCode) return text;
  const [translated] = await client().translate(trimmed, {
    ...(sourceLangCode ? { from: sourceLangCode } : {}),
    to: targetLangCode,
    format: 'text',
  });
  return translated;
}
