import { redirect } from 'next/navigation';
import { auth } from './auth';
import type { UserRole } from './roles';

export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
  displayName: string | null;
  targetLanguage?: string;
  nativeLanguage?: string;
}

const ROLE_RANK: Record<UserRole, number> = {
  regular: 0,
  admin: 1,
  superuser: 2,
};

/**
 * Returns the current session user, or redirects to the login page when there
 * is no authenticated session. For use in Server Components and Server Actions.
 */
export async function getSessionUser(): Promise<SessionUser> {
  const session = await auth();
  const user = session?.user as SessionUser | undefined;
  if (!user?.id) {
    redirect('/login');
  }
  return user;
}

/**
 * Ensures the current user has at least `minRole`, redirecting to /auth-error
 * otherwise (and to /login when unauthenticated). Returns the session user on
 * success. API route handlers should instead do an inline role check and
 * return a 403 JSON response (see the visibility/ownership guards).
 */
export async function requireRole(minRole: UserRole): Promise<SessionUser> {
  const user = await getSessionUser();
  if (ROLE_RANK[user.role] < ROLE_RANK[minRole]) {
    redirect('/auth-error');
  }
  return user;
}
