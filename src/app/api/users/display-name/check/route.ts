import { NextResponse } from 'next/server';
import { and, ne, sql } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { apiUser } from '@/lib/api-auth';

// GET /api/users/display-name/check?name=... — case-insensitive availability,
// excluding the current user (so they can keep their own name).
export async function GET(req: Request) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const name = new URL(req.url).searchParams.get('name')?.trim() ?? '';
  if (!name) return NextResponse.json({ available: false });

  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(sql`lower(${users.displayName}) = lower(${name})`, ne(users.id, user.id)))
    .limit(1);

  return NextResponse.json({ available: !taken });
}
