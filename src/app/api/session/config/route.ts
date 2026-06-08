import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { appSettings } from '@/db/schema';
import { apiUser } from '@/lib/api-auth';
import { canManageRoles } from '@/lib/roles';
import {
  APP_SETTINGS_ID,
  SESSION_BOUNDS,
  getSessionConfig,
  invalidateSessionConfigCache,
} from '@/lib/session-config';

// GET — any authenticated user (the client session manager needs the policy to
// run its idle timer + warning popup).
export async function GET() {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await getSessionConfig());
}

const patchSchema = z
  .object({
    idleTimeoutSeconds: z
      .number()
      .int()
      .min(SESSION_BOUNDS.idleMin)
      .max(SESSION_BOUNDS.idleMax),
    warningSeconds: z
      .number()
      .int()
      .min(SESSION_BOUNDS.warningMin)
      .max(SESSION_BOUNDS.warningMax),
  })
  .refine((d) => d.warningSeconds < d.idleTimeoutSeconds, {
    message: 'Warning lead time must be shorter than the idle timeout',
    path: ['warningSeconds'],
  });

// PATCH — superuser only. Updates the global policy for ALL users.
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
  const { idleTimeoutSeconds, warningSeconds } = parsed.data;

  await db
    .insert(appSettings)
    .values({ id: APP_SETTINGS_ID, sessionIdleTimeoutSeconds: idleTimeoutSeconds, sessionWarningSeconds: warningSeconds, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.id,
      set: {
        sessionIdleTimeoutSeconds: idleTimeoutSeconds,
        sessionWarningSeconds: warningSeconds,
        updatedAt: new Date(),
      },
    });
  invalidateSessionConfigCache();

  return NextResponse.json({ idleTimeoutSeconds, warningSeconds });
}
