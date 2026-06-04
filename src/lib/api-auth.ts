import { auth } from './auth';
import type { UserRole } from './roles';
import { normalizeLocale, type Locale } from './locales';

export interface ApiUser {
  id: string;
  role: UserRole;
  displayName: string | null;
  /** The user's base language / UI locale (for gloss resolution, etc.). */
  baseLanguage: Locale;
}

/**
 * Resolves the authenticated user for an API route handler, or null when there
 * is no session. Unlike the Server-Component helpers in auth-helpers.ts, this
 * never redirects — callers return a 401/403 JSON response themselves.
 */
export async function apiUser(): Promise<ApiUser | null> {
  const session = await auth();
  const u = session?.user as
    | { id?: string; role?: UserRole; displayName?: string | null; nativeLanguage?: string }
    | undefined;
  if (!u?.id) return null;
  return {
    id: u.id,
    role: u.role ?? 'regular',
    displayName: u.displayName ?? null,
    baseLanguage: normalizeLocale(u.nativeLanguage),
  };
}
