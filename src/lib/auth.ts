import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { verify as argonVerify } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { z } from 'zod';
import { env } from './env';
import { normalizeLanguageCode } from './languages';

const credSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: env.AUTH_SECRET,
  session: { strategy: 'jwt' },
  pages: {
    signIn: `${basePath}/login`,
    error: `${basePath}/auth-error`,
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize: async (raw) => {
        const parsed = credSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        if (!user) return null;
        // Reject unverified accounts. We return null so the credentials
        // provider produces the generic "Invalid credentials" error without
        // leaking which condition failed.
        if (!user.emailVerifiedAt) return null;
        const ok = await argonVerify(user.passwordHash, password);
        if (!ok) return null;
        return {
          id: user.id,
          email: user.email,
          // `name` is the only standard non-email user prop Auth.js types know
          // about; leave it null and use email everywhere in our UI.
        };
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user, trigger }) => {
      if (user) {
        token.userId = user.id as string;
        // iat is set by next-auth itself
      }
      // Check sessions_invalidated_at — reject if the JWT predates it.
      // Also refresh the language codes on every jwt callback so settings
      // changes are reflected on the next request without re-login.
      if (token.userId) {
        const [row] = await db
          .select({
            inv: users.sessionsInvalidatedAt,
            target: users.targetLanguage,
            native: users.nativeLanguage,
            role: users.role,
            displayName: users.displayName,
          })
          .from(users)
          .where(eq(users.id, token.userId as string))
          .limit(1);
        if (token.iat) {
          const invSec = row?.inv ? Math.floor(row.inv.getTime() / 1000) : 0;
          if (invSec > (token.iat as number)) {
            token.invalidated = true;
          }
        }
        if (row) {
          token.targetLanguage = normalizeLanguageCode(row.target);
          token.nativeLanguage = normalizeLanguageCode(row.native);
          // Refreshed every request so role/displayName changes (role grants,
          // setting a display name) take effect without re-login.
          token.role = row.role ?? 'regular';
          token.displayName = row.displayName ?? null;
        }
      }
      // `trigger` can be used by middleware-driven token updates if needed
      void trigger;
      return token;
    },
    session: async ({ session, token }) => {
      if (token.invalidated) {
        // Returning null here is not allowed by Auth.js types, but we can
        // surface invalidation by clearing identifying fields and letting
        // the (app) layout's auth() check redirect.
        return { ...session, user: { ...session.user, email: '' }, expires: new Date(0).toISOString() };
      }
      if (token.userId && session.user) {
        const u = session.user as {
          id?: string;
          targetLanguage?: string;
          nativeLanguage?: string;
          role?: string;
          displayName?: string | null;
        };
        u.id = token.userId as string;
        if (token.targetLanguage) u.targetLanguage = token.targetLanguage as string;
        if (token.nativeLanguage) u.nativeLanguage = token.nativeLanguage as string;
        u.role = (token.role as string) ?? 'regular';
        u.displayName = (token.displayName as string | null) ?? null;
      }
      return session;
    },
  },
});
