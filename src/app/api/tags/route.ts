import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { tags } from '@/db/schema';
import { auth } from '@/lib/auth';
import { tagVisibleSql } from '@/lib/visibility';

export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Visibility (§3a): own tags plus shared tags.
  const rows = await db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(tagVisibleSql(userId))
    .orderBy(asc(tags.name));
  return NextResponse.json({ tags: rows });
}

const createSchema = z.object({ name: z.string().min(1).max(50) });

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }
  const name = parsed.data.name.trim();
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  // Auto-merge (§3e): if a shared tag with this name (case-insensitive) already
  // exists — created by anyone — reuse it instead of creating a duplicate, so
  // shared content converges on a single canonical tag.
  const [sharedExisting] = await db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(and(eq(tags.visibility, 'shared'), sql`lower(${tags.name}) = lower(${name})`))
    .limit(1);
  if (sharedExisting) return NextResponse.json(sharedExisting);

  // Find-or-create the user's own (private) tag. Tag names are unique per user,
  // so a repeat returns the existing tag rather than erroring — keeps the
  // create-new picker idempotent.
  const [existing] = await db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(and(eq(tags.userId, userId), eq(tags.name, name)))
    .limit(1);
  if (existing) return NextResponse.json(existing);

  const [created] = await db
    .insert(tags)
    .values({ userId, name, createdBy: userId })
    .returning({ id: tags.id, name: tags.name });
  return NextResponse.json(created, { status: 201 });
}
