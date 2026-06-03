import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { appSettings } from '@/db/schema';
import { apiUser } from '@/lib/api-auth';
import { canManageRoles } from '@/lib/roles';

// The single global app-settings row is always id=1.
const SINGLETON_ID = 1;
const DEFAULT_TIMEOUT_SECONDS = 120;

/**
 * Reads the singleton app_settings row, returning the avatar inactivity
 * timeout. Falls back to the default (120s) if the row is missing rather than
 * erroring — the avatar page must always get a usable value.
 */
async function readTimeoutSeconds(): Promise<number> {
  const [row] = await db
    .select({ seconds: appSettings.avatarInactivityTimeoutSeconds })
    .from(appSettings)
    .where(eq(appSettings.id, SINGLETON_ID))
    .limit(1);
  return row?.seconds ?? DEFAULT_TIMEOUT_SECONDS;
}

// GET /api/settings/avatar — any authenticated user (the avatar page reads it).
export async function GET() {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const avatarInactivityTimeoutSeconds = await readTimeoutSeconds();
  return NextResponse.json({ avatarInactivityTimeoutSeconds });
}

const patchSchema = z.object({
  // 30s–1800s (0.5–30 min), in 30s increments.
  avatarInactivityTimeoutSeconds: z
    .number()
    .int()
    .min(30)
    .max(1800)
    .refine((n) => n % 30 === 0, { message: 'Must be a multiple of 30 seconds' }),
});

// PATCH /api/settings/avatar — superuser only. Upserts the singleton row.
export async function PATCH(req: Request) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageRoles(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { avatarInactivityTimeoutSeconds } = parsed.data;
  await db
    .insert(appSettings)
    .values({
      id: SINGLETON_ID,
      avatarInactivityTimeoutSeconds,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: appSettings.id,
      set: { avatarInactivityTimeoutSeconds, updatedAt: new Date() },
    });

  return NextResponse.json({ avatarInactivityTimeoutSeconds });
}
