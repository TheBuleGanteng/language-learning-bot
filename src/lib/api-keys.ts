import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { userSettings, globalApiKeys } from '@/db/schema';
import { decryptString } from '@/lib/crypto';

export type Provider = 'anthropic' | 'openai' | 'google';
export const PROVIDERS: Provider[] = ['anthropic', 'openai', 'google'];

// Provider → encrypted personal-key column (google is stored in the Gemini column).
const PERSONAL_COL = {
  anthropic: 'anthropicApiKeyEncrypted',
  openai: 'openaiApiKeyEncrypted',
  google: 'geminiApiKeyEncrypted',
} as const;

// Provider → "ever set a personal key" flag column.
const EVER_SET_COL = {
  anthropic: 'anthropicKeyEverSet',
  openai: 'openaiKeyEverSet',
  google: 'googleKeyEverSet',
} as const;

type SettingsRow = typeof userSettings.$inferSelect;

function personalEncrypted(s: SettingsRow | undefined, provider: Provider): string | null {
  return s ? ((s[PERSONAL_COL[provider]] as string | null) ?? null) : null;
}
function everSet(s: SettingsRow | undefined, provider: Provider): boolean {
  return s ? Boolean(s[EVER_SET_COL[provider]]) : false;
}

async function globalEncrypted(provider: Provider): Promise<string | null> {
  const [g] = await db
    .select({ encryptedKey: globalApiKeys.encryptedKey })
    .from(globalApiKeys)
    .where(eq(globalApiKeys.provider, provider))
    .limit(1);
  return g?.encryptedKey ?? null;
}

export interface ResolvedKey {
  key: string | null;
  source: 'personal' | 'global' | 'none';
}

/**
 * Resolve the API key to actually use for a user + provider:
 *   personal key → else the global key (only if eligible) → else none.
 *
 * Eligibility for the global key = the user has NO personal key now AND has
 * NEVER set one (the ever-set flag). A set-then-deleted user is NOT eligible.
 * Decryption failures degrade to `none` (never throw the secret into a log path).
 */
export async function resolveApiKey(userId: string, provider: Provider): Promise<ResolvedKey> {
  const [s] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  const personalEnc = personalEncrypted(s, provider);
  if (personalEnc) {
    try {
      return { key: decryptString(personalEnc), source: 'personal' };
    } catch {
      return { key: null, source: 'none' };
    }
  }

  // No personal key. Eligible for the global key only if they never set one.
  if (everSet(s, provider)) return { key: null, source: 'none' };

  const globalEnc = await globalEncrypted(provider);
  if (globalEnc) {
    try {
      return { key: decryptString(globalEnc), source: 'global' };
    } catch {
      return { key: null, source: 'none' };
    }
  }
  return { key: null, source: 'none' };
}

export interface KeyStatus {
  hasPersonalKey: boolean;
  /** No personal key, eligible, and a global key is set → the user falls back to it. */
  usingGlobalKey: boolean;
}

/** Per-provider status for the settings UI — never returns any key value. */
export async function providerKeyStatus(userId: string, provider: Provider): Promise<KeyStatus> {
  const [s] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  if (personalEncrypted(s, provider)) return { hasPersonalKey: true, usingGlobalKey: false };
  if (everSet(s, provider)) return { hasPersonalKey: false, usingGlobalKey: false };
  const hasGlobal = (await globalEncrypted(provider)) != null;
  return { hasPersonalKey: false, usingGlobalKey: hasGlobal };
}

/** Status for all providers at once (used by the settings GET). */
export async function allProviderKeyStatus(
  userId: string,
): Promise<Record<Provider, KeyStatus>> {
  const entries = await Promise.all(
    PROVIDERS.map(async (p) => [p, await providerKeyStatus(userId, p)] as const),
  );
  return Object.fromEntries(entries) as Record<Provider, KeyStatus>;
}
