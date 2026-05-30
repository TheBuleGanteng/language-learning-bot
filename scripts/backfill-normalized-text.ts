// One-time backfill of the normalized search columns on vocab_items.
// Run after applying the migration that adds target_text_normalized /
// native_text_normalized.
//
// Usage:
//   node --env-file=.env.local --import tsx scripts/backfill-normalized-text.ts
import { eq } from 'drizzle-orm';
import { db } from '../src/db';
import { vocabItems } from '../src/db/schema';
import { normalizeText } from '../src/lib/text-normalize';

async function backfill() {
  const rows = await db
    .select({
      id: vocabItems.id,
      targetText: vocabItems.targetText,
      nativeText: vocabItems.nativeText,
    })
    .from(vocabItems);

  console.log(`Backfilling ${rows.length} rows...`);

  let updated = 0;
  for (const row of rows) {
    await db
      .update(vocabItems)
      .set({
        targetTextNormalized: normalizeText(row.targetText),
        nativeTextNormalized: normalizeText(row.nativeText ?? ''),
      })
      .where(eq(vocabItems.id, row.id));
    updated++;
    if (updated % 100 === 0) console.log(`  ${updated}/${rows.length}`);
  }

  console.log(`Done. Updated ${updated} rows.`);
  process.exit(0);
}

backfill().catch((e) => {
  console.error(e);
  process.exit(1);
});
