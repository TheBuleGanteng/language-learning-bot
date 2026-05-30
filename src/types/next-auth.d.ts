import type { DefaultSession } from 'next-auth';
import type { UserRole } from '@/lib/roles';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      role: UserRole;
      displayName: string | null;
      // Language preferences are also surfaced on the session user (set in the
      // auth callbacks) and are kept optional here so existing reads compile.
      targetLanguage?: string;
      nativeLanguage?: string;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
    role?: UserRole;
    displayName?: string | null;
    targetLanguage?: string;
    nativeLanguage?: string;
    invalidated?: boolean;
  }
}
