import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, isNull, gt } from 'drizzle-orm';
import { db } from '@/db';
import { users, verificationTokens } from '@/db/schema';
import { sha256Hex } from '@/lib/crypto';
import { checkRateLimit, ipFromRequest } from '@/lib/rate-limit';

const schema = z.object({ token: z.string().min(8) });

export async function POST(req: Request) {
  const rl = checkRateLimit({
    bucket: 'verify',
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
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  const tokenHash = sha256Hex(parsed.data.token);
  const now = new Date();
  const [row] = await db
    .select()
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.tokenHash, tokenHash),
        eq(verificationTokens.purpose, 'email_verify'),
        isNull(verificationTokens.usedAt),
        gt(verificationTokens.expiresAt, now),
      ),
    )
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 });
  }

  await db.transaction(async (tx) => {
    await tx
      .update(verificationTokens)
      .set({ usedAt: now })
      .where(eq(verificationTokens.id, row.id));
    await tx
      .update(users)
      .set({ emailVerifiedAt: now, updatedAt: now })
      .where(eq(users.id, row.userId));
  });

  return NextResponse.json({ ok: true });
}
