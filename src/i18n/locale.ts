import 'server-only';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { users } from '@/db/schema';
import { normalizeLocale, defaultLocale, LOCALE_COOKIE, type Locale } from '@/lib/locales';

/**
 * Server-side locale resolution (B0 order):
 *   1. the authenticated user's base language (`users.native_language`)
 *   2. the `NEXT_LOCALE` cookie (pre-auth / sign-up)
 *   3. the default locale (`en-US`)
 * Every lookup is defensive: any failure falls through to the next source.
 */
export async function resolveLocale(): Promise<Locale> {
  // (1) authenticated user's stored base language.
  try {
    const session = await auth();
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (userId) {
      const [row] = await db
        .select({ base: users.nativeLanguage })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (row?.base) return normalizeLocale(row.base);
    }
  } catch {
    // No session / DB unavailable / static render — fall through.
  }

  // (2) NEXT_LOCALE cookie.
  try {
    const store = await cookies();
    const cookieLocale = store.get(LOCALE_COOKIE)?.value;
    if (cookieLocale) return normalizeLocale(cookieLocale);
  } catch {
    // cookies() unavailable (e.g. static generation) — fall through.
  }

  // (3) default.
  return defaultLocale();
}
