import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users, verificationTokens } from '@/db/schema';
import { generateToken } from '@/lib/crypto';
import { sendPasswordResetEmail } from '@/lib/email';
import { env } from '@/lib/env';
import { checkRateLimit, ipFromRequest } from '@/lib/rate-limit';

const schema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  const rl = checkRateLimit({
    bucket: 'forgot-password',
    ip: ipFromRequest(req),
    limit: 5,
    windowMs: 15 * 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    // Still return ok — don't leak validation hints either
    return NextResponse.json({ ok: true });
  }

  const normEmail = parsed.data.email.toLowerCase().trim();
  const [user] = await db.select().from(users).where(eq(users.email, normEmail)).limit(1);

  // Always return ok — never leak account existence
  if (user && user.emailVerifiedAt) {
    const { token, tokenHash } = generateToken();
    await db.insert(verificationTokens).values({
      userId: user.id,
      tokenHash,
      purpose: 'password_reset',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const link = `${env.APP_URL}${env.NEXT_PUBLIC_BASE_PATH ?? ''}/reset-password?token=${token}`;
    await sendPasswordResetEmail(user.email, link);
  }

  return NextResponse.json({ ok: true });
}
