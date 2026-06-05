import { NextResponse } from 'next/server';
import { z } from 'zod';
import { hash as argonHash } from '@node-rs/argon2';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { users, verificationTokens } from '@/db/schema';
import { sha256Hex } from '@/lib/crypto';
import { checkRateLimit, ipFromRequest } from '@/lib/rate-limit';

const schema = z.object({
  token: z.string().min(8),
  password: z
    .string()
    .min(8, 'Must be at least 8 characters')
    .max(200)
    .regex(/[A-Za-z]/, 'Must contain a letter')
    .regex(/[0-9]/, 'Must contain a number'),
});

export async function POST(req: Request) {
  // Throttle token-guessing / submission floods (the token itself is 256-bit,
  // so this is defense in depth alongside single-use + expiry).
  const rl = checkRateLimit({
    bucket: 'reset-password',
    ip: ipFromRequest(req),
    limit: 10,
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
    return NextResponse.json(
      { error: 'Invalid input', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const tokenHash = sha256Hex(parsed.data.token);
  const now = new Date();
  const [row] = await db
    .select()
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.tokenHash, tokenHash),
        eq(verificationTokens.purpose, 'password_reset'),
        isNull(verificationTokens.usedAt),
        gt(verificationTokens.expiresAt, now),
      ),
    )
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 });
  }

  const newHash = await argonHash(parsed.data.password);
  await db.transaction(async (tx) => {
    await tx
      .update(verificationTokens)
      .set({ usedAt: now })
      .where(eq(verificationTokens.id, row.id));
    // Invalidate existing JWTs by bumping sessions_invalidated_at past now.
    // JWT callback will check iat against this and reject older tokens.
    await tx
      .update(users)
      .set({
        passwordHash: newHash,
        sessionsInvalidatedAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, row.userId));
  });

  return NextResponse.json({ ok: true });
}
