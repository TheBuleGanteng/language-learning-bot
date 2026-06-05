import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import {
  users,
  vocabItems,
  lessons,
  tags,
  lessonFiles,
  lessonLinks,
} from '@/db/schema';
import { apiUser } from '@/lib/api-auth';
import { canManageRoles } from '@/lib/roles';

// POST /api/users/[id]/remove — superuser only. Two independent axes:
//   userAction: 'remove' (delete the account) | 'disable' (keep, block login)
//   dataAction: 'delete' (remove their data) | 'reassign' (transfer to me)
//
// Reassign moves OWNERSHIP (user_id) — not just created_by — because the content
// FKs cascade on user_id; otherwise removing the account would cascade-delete the
// "reassigned" rows. createdBy is also set so attribution shows the superuser.
const schema = z.object({
  userAction: z.enum(['remove', 'disable']),
  dataAction: z.enum(['delete', 'reassign']),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const acting = await apiUser();
  if (!acting) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageRoles(acting.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await ctx.params;

  // Self-guard: a superuser may not remove or disable their own account.
  if (id === acting.id) {
    return NextResponse.json({ error: 'You cannot remove or disable your own account' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  const { userAction, dataAction } = parsed.data;

  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    await db.transaction(async (tx) => {
      if (dataAction === 'reassign') {
        // Transfer ownership to the acting superuser, preserving each row's
        // visibility. user_id moves so the rows survive an account deletion.
        await tx
          .update(vocabItems)
          .set({ userId: acting.id, createdBy: acting.id, updatedAt: new Date() })
          .where(eq(vocabItems.userId, target.id));
        await tx
          .update(lessons)
          .set({ userId: acting.id, createdBy: acting.id })
          .where(eq(lessons.userId, target.id));
        await tx
          .update(tags)
          .set({ userId: acting.id, createdBy: acting.id })
          .where(eq(tags.userId, target.id));
        await tx
          .update(lessonFiles)
          .set({ userId: acting.id })
          .where(eq(lessonFiles.userId, target.id));
        await tx
          .update(lessonLinks)
          .set({ userId: acting.id })
          .where(eq(lessonLinks.userId, target.id));
      } else {
        // Delete all the user's content (including shared). FK cascades clean up
        // dependents (vocab_tags, vocab_lessons, item_performance, glosses, and
        // the files/links of deleted lessons).
        await tx.delete(lessonFiles).where(eq(lessonFiles.userId, target.id));
        await tx.delete(lessonLinks).where(eq(lessonLinks.userId, target.id));
        await tx.delete(lessons).where(eq(lessons.userId, target.id));
        await tx.delete(vocabItems).where(eq(vocabItems.userId, target.id));
        await tx.delete(tags).where(eq(tags.userId, target.id));
      }

      if (userAction === 'remove') {
        // Cascades the remaining auth rows (accounts/sessions/user_settings/
        // verification_tokens/item_performance, etc.).
        await tx.delete(users).where(eq(users.id, target.id));
      } else {
        // Disable: keep the record, block login, and invalidate live sessions.
        const now = new Date();
        await tx
          .update(users)
          .set({ disabledAt: now, sessionsInvalidatedAt: now, updatedAt: now })
          .where(eq(users.id, target.id));
      }
    });
  } catch {
    // Most likely a unique-name collision when reassigning lessons into the
    // superuser's own namespace.
    return NextResponse.json(
      { error: 'Could not complete — a name collision may exist with your account' },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, userAction, dataAction });
}
