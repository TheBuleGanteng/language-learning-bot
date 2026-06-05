import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { globalApiKeys } from '@/db/schema';
import { apiUser } from '@/lib/api-auth';
import { canManageRoles } from '@/lib/roles';
import { decryptString } from '@/lib/crypto';

const schema = z.object({ provider: z.enum(['anthropic', 'openai', 'google']) });

// POST — reveal a global key's decrypted value. Superuser-only, explicit request
// (POST, not part of any list payload). The value is returned to NO ONE else.
export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageRoles(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const [g] = await db
    .select({ encryptedKey: globalApiKeys.encryptedKey })
    .from(globalApiKeys)
    .where(eq(globalApiKeys.provider, parsed.data.provider))
    .limit(1);
  if (!g) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    return NextResponse.json({ value: decryptString(g.encryptedKey) });
  } catch {
    return NextResponse.json({ error: 'Stored key could not be decrypted' }, { status: 500 });
  }
}
