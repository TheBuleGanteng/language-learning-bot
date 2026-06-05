import { NextResponse } from 'next/server';
import { asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { hash as argonHash } from '@node-rs/argon2';
import { db } from '@/db';
import { users, userSettings } from '@/db/schema';
import { apiUser } from '@/lib/api-auth';
import { canManageRoles } from '@/lib/roles';

// GET /api/users — superuser only. Optional ?q= filters by email or display name.
export async function GET(req: Request) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageRoles(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const q = new URL(req.url).searchParams.get('q')?.trim();
  const filter = q
    ? sql`(lower(${users.email}) LIKE ${'%' + q.toLowerCase() + '%'} OR lower(coalesce(${users.displayName}, '')) LIKE ${'%' + q.toLowerCase() + '%'})`
    : undefined;

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      disabledAt: users.disabledAt,
    })
    .from(users)
    .where(filter)
    .orderBy(asc(users.email))
    .limit(200);

  return NextResponse.json({
    users: rows.map((r) => ({ ...r, disabled: r.disabledAt != null })),
  });
}

// Admin-create account (PART 4) — superuser only. Creates an ACTIVE, verified
// account (bypasses the email-verification round-trip) with a temp password the
// superuser shares manually. No email is sent; role defaults to regular.
const createSchema = z.object({
  email: z.string().email().max(254),
  password: z
    .string()
    .min(8, 'Must be at least 8 characters')
    .max(200)
    .regex(/[A-Za-z]/, 'Must contain a letter')
    .regex(/[0-9]/, 'Must contain a number'),
});

export async function POST(req: Request) {
  const acting = await apiUser();
  if (!acting) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageRoles(acting.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const normEmail = parsed.data.email.toLowerCase().trim();

  // Admin-create surfaces duplicates with a clear message (unlike public signup,
  // which stays silent to avoid account-existence leaks).
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normEmail))
    .limit(1);
  if (existing) {
    return NextResponse.json(
      { error: 'An account with that email already exists' },
      { status: 409 },
    );
  }

  const passwordHash = await argonHash(parsed.data.password);
  const [newUser] = await db
    .insert(users)
    .values({
      email: normEmail,
      passwordHash,
      // Bypass verification: mark verified now so the user can log in immediately.
      emailVerifiedAt: new Date(),
      // role defaults to 'regular'; disabledAt defaults to null (active).
    })
    .returning({ id: users.id, email: users.email, role: users.role });

  await db.insert(userSettings).values({ userId: newUser.id }).onConflictDoNothing();

  return NextResponse.json(
    { id: newUser.id, email: newUser.email, role: newUser.role, disabled: false },
    { status: 201 },
  );
}
