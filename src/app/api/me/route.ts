import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { auth } from '@/lib/auth';
import { normalizeLanguageCode } from '@/lib/languages';
import { normalizeLocale } from '@/lib/locales';

/**
 * Returns the authenticated user's profile fields the client needs to render
 * language-aware UI (target/native language codes). Lightweight on purpose —
 * avoids exposing more than the UI needs.
 */
export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      targetLanguage: users.targetLanguage,
      nativeLanguage: users.nativeLanguage,
      role: users.role,
      displayName: users.displayName,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    id: row.id,
    email: row.email,
    targetLanguage: normalizeLanguageCode(row.targetLanguage),
    nativeLanguage: normalizeLocale(row.nativeLanguage),
    role: row.role,
    displayName: row.displayName,
  });
}
