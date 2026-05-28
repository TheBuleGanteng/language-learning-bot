import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  cancelBatchForUser,
  getBatchStatusForUser,
  resetStaleGenerating,
} from '@/lib/image-gen/executor';

export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await resetStaleGenerating(userId);
  const snap = getBatchStatusForUser(userId);
  return NextResponse.json({ batch: snap });
}

export async function DELETE() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const cancelled = cancelBatchForUser(userId);
  return NextResponse.json({ cancelled });
}
