import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { lessons, tags } from '@/db/schema';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function findOrCreateLesson(
  tx: Tx,
  userId: string,
  name: string,
): Promise<string> {
  const trimmed = name.trim();
  const [existing] = await tx
    .select({ id: lessons.id })
    .from(lessons)
    .where(and(eq(lessons.userId, userId), eq(lessons.name, trimmed)))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await tx
    .insert(lessons)
    .values({ userId, name: trimmed })
    .returning({ id: lessons.id });
  return created.id;
}

export async function findOrCreateTags(
  tx: Tx,
  userId: string,
  names: string[],
): Promise<string[]> {
  const trimmed = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
  if (trimmed.length === 0) return [];
  const existing = await tx
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(and(eq(tags.userId, userId), inArray(tags.name, trimmed)));
  const existingMap = new Map(existing.map((t) => [t.name, t.id]));
  const missing = trimmed.filter((n) => !existingMap.has(n));
  if (missing.length > 0) {
    const created = await tx
      .insert(tags)
      .values(missing.map((name) => ({ userId, name })))
      .returning({ id: tags.id, name: tags.name });
    for (const t of created) existingMap.set(t.name, t.id);
  }
  return trimmed.map((n) => existingMap.get(n)!);
}
