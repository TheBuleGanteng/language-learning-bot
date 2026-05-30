import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { apiUser } from '@/lib/api-auth';

// 2–50 chars: letters, numbers, spaces, underscores, hyphens.
const DISPLAY_NAME_RE = /^[A-Za-z0-9 _-]{2,50}$/;

const schema = z.object({ displayName: z.string().max(100) });

// PATCH /api/users/me/display-name — set the caller's display name.
export async function PATCH(req: Request) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }
  const name = parsed.data.displayName.trim();
  if (!DISPLAY_NAME_RE.test(name)) {
    return NextResponse.json(
      {
        error:
          'Display name must be 2–50 characters: letters, numbers, spaces, underscores, hyphens.',
      },
      { status: 400 },
    );
  }

  // Case-insensitive uniqueness, excluding the current user.
  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(sql`lower(${users.displayName}) = lower(${name})`, ne(users.id, user.id)))
    .limit(1);
  if (taken) {
    return NextResponse.json({ error: 'Name taken' }, { status: 409 });
  }

  const [updated] = await db
    .update(users)
    .set({ displayName: name, updatedAt: new Date() })
    .where(eq(users.id, user.id))
    .returning({ id: users.id, email: users.email, displayName: users.displayName, role: users.role });

  return NextResponse.json(updated);
}
