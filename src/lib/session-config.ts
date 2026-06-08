import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { appSettings } from '@/db/schema';

// Global, superuser-controlled session policy (applies to ALL users). Stored on
// the singleton app_settings row. Read on every auth request, so it's cached
// in-memory with a short TTL to avoid a DB hit per request.

export const APP_SETTINGS_ID = 1;

export const SESSION_DEFAULTS = {
  idleTimeoutSeconds: 1800, // 30 min
  warningSeconds: 300, // 5 min before the cutoff
} as const;

// Bounds for the superuser-editable values (seconds).
export const SESSION_BOUNDS = {
  idleMin: 60, // 1 min
  idleMax: 2_592_000, // 30 days
  warningMin: 30, // 30 s
  warningMax: 86_400, // 1 day
} as const;

export interface SessionConfig {
  idleTimeoutSeconds: number;
  warningSeconds: number;
}

const CACHE_TTL_MS = 15_000;
let cache: { value: SessionConfig; expires: number } | null = null;

/** Read the global session policy (cached ~15s). Falls back to defaults. */
export async function getSessionConfig(): Promise<SessionConfig> {
  if (cache && cache.expires > Date.now()) return cache.value;
  let value: SessionConfig = { ...SESSION_DEFAULTS };
  try {
    const [row] = await db
      .select({
        idle: appSettings.sessionIdleTimeoutSeconds,
        warn: appSettings.sessionWarningSeconds,
      })
      .from(appSettings)
      .where(eq(appSettings.id, APP_SETTINGS_ID))
      .limit(1);
    if (row) {
      value = {
        idleTimeoutSeconds: row.idle ?? SESSION_DEFAULTS.idleTimeoutSeconds,
        warningSeconds: row.warn ?? SESSION_DEFAULTS.warningSeconds,
      };
    }
  } catch {
    // DB hiccup — use defaults rather than locking everyone out.
  }
  cache = { value, expires: Date.now() + CACHE_TTL_MS };
  return value;
}

/** Drop the cache so a superuser's change takes effect immediately. */
export function invalidateSessionConfigCache() {
  cache = null;
}
