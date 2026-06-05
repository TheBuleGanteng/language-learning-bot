import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { globalApiKeys } from '@/db/schema';
import { apiUser } from '@/lib/api-auth';
import { canManageRoles } from '@/lib/roles';
import { encryptString } from '@/lib/crypto';
import { PROVIDERS } from '@/lib/api-keys';

// Superuser-only global API keys. Defense in depth: every method here gates on
// canManageRoles, so non-superusers can't read status, reveal, save, or remove —
// the value is never returned except via the explicit reveal route, superuser-only.

// GET — per-provider hasKey status ONLY (never any value).
export async function GET() {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageRoles(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const rows = await db.select({ provider: globalApiKeys.provider }).from(globalApiKeys);
  const set = new Set(rows.map((r) => r.provider));
  return NextResponse.json({
    keys: Object.fromEntries(PROVIDERS.map((p) => [p, { hasKey: set.has(p) }])),
  });
}

const schema = z.object({
  provider: z.enum(['anthropic', 'openai', 'google']),
  value: z.string().nullable(),
});

// PATCH — save (encrypt + upsert) or remove (value=null → delete) a global key.
export async function PATCH(req: Request) {
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
  const { provider, value } = parsed.data;

  if (value && value.trim()) {
    const encryptedKey = encryptString(value.trim());
    await db
      .insert(globalApiKeys)
      .values({ provider, encryptedKey, createdBy: user.id })
      .onConflictDoUpdate({
        target: globalApiKeys.provider,
        set: { encryptedKey, createdBy: user.id, updatedAt: new Date() },
      });
  } else {
    // Removing a global key immediately unshares it from all eligible users.
    await db.delete(globalApiKeys).where(eq(globalApiKeys.provider, provider));
  }

  return NextResponse.json({ ok: true });
}
