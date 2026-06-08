import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { apiUser } from '@/lib/api-auth';

// Records user activity so the idle-session window resets. Called by the client
// session manager on real interaction (debounced) and on the "stay logged in"
// action. Cheap single-row UPDATE by PK.
export async function POST() {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await db.update(users).set({ lastActivityAt: new Date() }).where(eq(users.id, user.id));
  return NextResponse.json({ ok: true });
}
