import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { importNotionCsvForUser } from '@/lib/csv-import';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'Empty file' }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 413 });
  }

  const csv = await file.text();
  try {
    const result = await importNotionCsvForUser(userId, csv);
    return NextResponse.json(result);
  } catch (err) {
    console.error('CSV import failed:', err);
    return NextResponse.json(
      { error: 'Import failed', detail: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}
