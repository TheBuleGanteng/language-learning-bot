import { auth } from './auth';
import type { UserRole } from './roles';

export interface ApiUser {
  id: string;
  role: UserRole;
  displayName: string | null;
}

/**
 * Resolves the authenticated user for an API route handler, or null when there
 * is no session. Unlike the Server-Component helpers in auth-helpers.ts, this
 * never redirects — callers return a 401/403 JSON response themselves.
 */
export async function apiUser(): Promise<ApiUser | null> {
  const session = await auth();
  const u = session?.user as
    | { id?: string; role?: UserRole; displayName?: string | null }
    | undefined;
  if (!u?.id) return null;
  return { id: u.id, role: u.role ?? 'regular', displayName: u.displayName ?? null };
}
