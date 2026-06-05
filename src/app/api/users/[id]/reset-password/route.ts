import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users, verificationTokens } from '@/db/schema';
import { apiUser } from '@/lib/api-auth';
import { canManageRoles } from '@/lib/roles';
import { generateToken } from '@/lib/crypto';
import { sendPasswordResetEmail } from '@/lib/email';
import { env } from '@/lib/env';

// POST /api/users/[id]/reset-password — superuser triggers the standard
// password-reset email for another user. Reuses the same token + Resend flow as
// the public forgot-password route.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const acting = await apiUser();
  if (!acting) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageRoles(acting.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await ctx.params;

  const [target] = await db
    .select({ id: users.id, email: users.email, native: users.nativeLanguage })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { token, tokenHash } = generateToken();
  await db.insert(verificationTokens).values({
    userId: target.id,
    tokenHash,
    purpose: 'password_reset',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
  });
  const link = `${env.APP_URL}${env.NEXT_PUBLIC_BASE_PATH ?? ''}/reset-password?token=${token}`;
  // Await the send and surface a real failure — no false success toast.
  const result = await sendPasswordResetEmail(target.email, link, target.native);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? 'Could not send the reset email' },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
