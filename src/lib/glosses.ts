import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { vocabItemGlosses } from '@/db/schema';
import { translateText, translateBatch } from '@/lib/translation';
import { normalizeLocale, localeToTranslateCode } from '@/lib/locales';

// C2: cross-base-language vocab glosses. The native/meaning side of a vocab item
// is written in the CREATOR's base language (`item.nativeLanguage`). A consumer
// with a different base language sees a translated gloss, produced ONCE per
// (item, base language) via Google Cloud Translation and reused across all
// users and sessions.

export interface GlossInput {
  id: string;
  /** The canonical native/meaning text (in `nativeLanguage`). */
  nativeText: string;
  /** The language the canonical native text is written in. */
  nativeLanguage: string;
}

export interface ResolvedGloss {
  text: string;
  /** True when machine-translated (vs the creator's original) — flagged in UI. */
  machine: boolean;
}

/**
 * Resolve a single item's gloss for `userBaseLanguage`. Returns the original
 * text when the languages match; otherwise returns a cached gloss or translates
 * (and caches) on the fly. Server-side only.
 */
export async function glossFor(
  item: GlossInput,
  userBaseLanguage: string | null | undefined,
): Promise<ResolvedGloss> {
  const base = normalizeLocale(userBaseLanguage);
  const itemLang = normalizeLocale(item.nativeLanguage);
  if (base === itemLang) return { text: item.nativeText, machine: false };

  const [existing] = await db
    .select()
    .from(vocabItemGlosses)
    .where(
      and(eq(vocabItemGlosses.vocabItemId, item.id), eq(vocabItemGlosses.baseLanguage, base)),
    )
    .limit(1);
  if (existing) return { text: existing.text, machine: existing.source === 'machine' };

  let text = item.nativeText;
  try {
    text = await translateText(
      item.nativeText,
      localeToTranslateCode(base),
      localeToTranslateCode(itemLang),
    );
    await db
      .insert(vocabItemGlosses)
      .values({ vocabItemId: item.id, baseLanguage: base, text, source: 'machine' })
      .onConflictDoNothing();
  } catch (err) {
    console.error('glossFor: translation failed, falling back to original', err);
    return { text: item.nativeText, machine: false };
  }
  return { text, machine: true };
}

/**
 * Batch-resolve glosses for many items for one base language (C2 performance):
 * one DB read for existing glosses, then ONE Google batch call per source
 * language for the missing ones. Returns a map keyed by item id.
 */
export async function glossesFor(
  items: GlossInput[],
  userBaseLanguage: string | null | undefined,
): Promise<Map<string, ResolvedGloss>> {
  const base = normalizeLocale(userBaseLanguage);
  const result = new Map<string, ResolvedGloss>();
  if (items.length === 0) return result;

  // Items already in the user's base language → original, no translation.
  const needLookup: GlossInput[] = [];
  for (const it of items) {
    if (normalizeLocale(it.nativeLanguage) === base) {
      result.set(it.id, { text: it.nativeText, machine: false });
    } else {
      needLookup.push(it);
    }
  }
  if (needLookup.length === 0) return result;

  // One read for all existing glosses in this base language.
  const existing = await db
    .select()
    .from(vocabItemGlosses)
    .where(
      and(
        inArray(
          vocabItemGlosses.vocabItemId,
          needLookup.map((i) => i.id),
        ),
        eq(vocabItemGlosses.baseLanguage, base),
      ),
    );
  const existingById = new Map(existing.map((g) => [g.vocabItemId, g]));

  const missing: GlossInput[] = [];
  for (const it of needLookup) {
    const g = existingById.get(it.id);
    if (g) result.set(it.id, { text: g.text, machine: g.source === 'machine' });
    else missing.push(it);
  }
  if (missing.length === 0) return result;

  // Group missing by source language; one batch translate call per group.
  const bySource = new Map<string, GlossInput[]>();
  for (const it of missing) {
    const src = localeToTranslateCode(it.nativeLanguage);
    const group = bySource.get(src);
    if (group) group.push(it);
    else bySource.set(src, [it]);
  }
  const target = localeToTranslateCode(base);

  for (const [src, group] of bySource) {
    try {
      const translations = await translateBatch(
        group.map((g) => g.nativeText),
        target,
        src,
      );
      const rows = group.map((it, i) => ({
        vocabItemId: it.id,
        baseLanguage: base,
        text: translations[i] ?? it.nativeText,
        source: 'machine' as const,
      }));
      await db.insert(vocabItemGlosses).values(rows).onConflictDoNothing();
      group.forEach((it, i) =>
        result.set(it.id, { text: translations[i] ?? it.nativeText, machine: true }),
      );
    } catch (err) {
      console.error('glossesFor: batch translation failed, using originals', err);
      group.forEach((it) => result.set(it.id, { text: it.nativeText, machine: false }));
    }
  }
  return result;
}

/**
 * Invalidation (C2): drop all cached glosses for an item — call when its
 * original native text OR its target word changes, so stale translations
 * regenerate on next access.
 */
export async function invalidateGlosses(vocabItemId: string): Promise<void> {
  await db.delete(vocabItemGlosses).where(eq(vocabItemGlosses.vocabItemId, vocabItemId));
}
