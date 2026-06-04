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
 * Translate `text` from `sourceLangCode` to `targetLangCode` (2-letter codes,
 * e.g. 'th' → 'en'). Returns the translated string. Never logs the text.
 */
export async function translateText(
  text: string,
  sourceLangCode: string,
  targetLangCode: string,
): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return text;
  // No-op when source and destination are the same language.
  if (sourceLangCode === targetLangCode) return text;
  const [translated] = await client().translate(trimmed, {
    from: sourceLangCode,
    to: targetLangCode,
    format: 'text',
  });
  return translated;
}
