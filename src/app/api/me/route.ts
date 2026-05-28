import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { auth } from '@/lib/auth';
import { normalizeLanguageCode } from '@/lib/languages';

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
      email: users.email,
      targetLanguage: users.targetLanguage,
      nativeLanguage: users.nativeLanguage,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    email: row.email,
    targetLanguage: normalizeLanguageCode(row.targetLanguage),
    nativeLanguage: normalizeLanguageCode(row.nativeLanguage),
  });
}
