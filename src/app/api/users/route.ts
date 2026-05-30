import { NextResponse } from 'next/server';
import { asc, sql } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
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
    })
    .from(users)
    .where(filter)
    .orderBy(asc(users.email))
    .limit(200);

  return NextResponse.json({ users: rows });
}
