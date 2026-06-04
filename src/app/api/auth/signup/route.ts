import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { hash as argonHash } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users, userSettings, verificationTokens } from '@/db/schema';
import { generateToken } from '@/lib/crypto';
import { sendVerificationEmail } from '@/lib/email';
import { env } from '@/lib/env';
import { checkRateLimit, ipFromRequest } from '@/lib/rate-limit';
import { normalizeLocale, LOCALE_COOKIE } from '@/lib/locales';

const schema = z.object({
  email: z.string().email().max(254),
  password: z
    .string()
    .min(8, 'Must be at least 8 characters')
    .max(200)
    .regex(/[A-Za-z]/, 'Must contain a letter')
    .regex(/[0-9]/, 'Must contain a number'),
});

export async function POST(req: Request) {
  const rl = checkRateLimit({
    bucket: 'signup',
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
    return NextResponse.json(
      { error: 'Invalid input', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { email, password } = parsed.data;
  const normEmail = email.toLowerCase().trim();

  // Check for existing account
  const existing = await db.select().from(users).where(eq(users.email, normEmail)).limit(1);
  if (existing.length > 0) {
    // Generic message — don't confirm/deny account existence
    return NextResponse.json({ ok: true });
  }

  // B5: capture the locale the sign-up UI was using as the new account's base
  // language (from the NEXT_LOCALE cookie the selector set).
  const cookieStore = await cookies();
  const baseLanguage = normalizeLocale(cookieStore.get(LOCALE_COOKIE)?.value);

  const passwordHash = await argonHash(password);
  const [newUser] = await db
    .insert(users)
    .values({ email: normEmail, passwordHash, nativeLanguage: baseLanguage })
    .returning({ id: users.id, email: users.email });

  // Default user_settings row
  await db.insert(userSettings).values({ userId: newUser.id }).onConflictDoNothing();

  // Generate verification token (valid 24h)
  const { token, tokenHash } = generateToken();
  await db.insert(verificationTokens).values({
    userId: newUser.id,
    tokenHash,
    purpose: 'email_verify',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  const link = `${env.APP_URL}/verify?token=${token}`;
  // Fire-and-forget so a slow Resend response doesn't block the user's signup.
  // sendVerificationEmail swallows its own errors and logs them.
  void sendVerificationEmail(newUser.email, link, baseLanguage);

  return NextResponse.json({ ok: true });
}
