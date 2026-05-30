# Search Quality + Special Character Input — Build Instructions

> Three connected improvements to vocab usability: relevance ranking on search, accent-agnostic matching, and a palette + hotkey scheme for typing IPA/diacritic characters. Work in order, commit per section, push to origin/main.

## Context

Three usability gaps in the current vocab management UI:

1. Search results aren't ranked by relevance — sorted by DB insertion order
2. Search isn't accent-agnostic — `saai` doesn't match `sǎai`
3. No way to input characters like `ǎ ɛ ʉ ɔ` and their accented variants except by copy-paste

This spec addresses all three. Section 1 fixes ranking. Section 2 adds normalized text columns and accent-agnostic search. Section 3 adds the character palette + hotkey input system.

Project path: `/home/thebuleganteng/01_Repos/06_personal_work/language-learning-bot`
Branch: `main`

---

## Section 1 — Relevance ranking in search

### 1.1 Ranking tiers

Order matches by these tiers (lower number = higher rank):

1. **Exact match** — `target_text = query` OR `native_text = query` (case-insensitive)
2. **Whole-word match** — `query` appears as a whole word in target or native
3. **Prefix match** — target or native starts with `query`
4. **Substring match** — target or native contains `query`

Within the same tier, sort by ascending length of the matched field (shorter results before longer).

The "matched field" for length tiebreaker: prefer target_text length if it matched on target; otherwise native_text length.

### 1.2 SQL implementation

In the vocab list query (likely in `/api/vocab` GET, or wherever the search/filter SQL is built):

```sql
SELECT v.*,
  CASE
    WHEN LOWER(v.target_text) = LOWER($q) OR LOWER(v.native_text) = LOWER($q) THEN 1
    WHEN LOWER(v.target_text) ~* ('\m' || $regex_q || '\M')
      OR LOWER(v.native_text) ~* ('\m' || $regex_q || '\M') THEN 2
    WHEN LOWER(v.target_text) LIKE (LOWER($q) || '%')
      OR LOWER(v.native_text) LIKE (LOWER($q) || '%') THEN 3
    WHEN LOWER(v.target_text) LIKE ('%' || LOWER($q) || '%')
      OR LOWER(v.native_text) LIKE ('%' || LOWER($q) || '%') THEN 4
    ELSE 5
  END AS match_tier,
  LEAST(LENGTH(v.target_text), LENGTH(v.native_text)) AS match_length
FROM vocab_items v
WHERE v.user_id = $userId
  AND (
    LOWER(v.target_text) LIKE ('%' || LOWER($q) || '%')
    OR LOWER(v.native_text) LIKE ('%' || LOWER($q) || '%')
  )
ORDER BY match_tier ASC, match_length ASC
```

The `$regex_q` is the search query with special regex characters escaped (`(`, `)`, `.`, `*`, etc.) so it can be safely interpolated into the `~*` whole-word pattern. Use a small helper:

```ts
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

The Postgres `\m` and `\M` are word-boundary assertions.

### 1.3 Apply only when a search query is present

The ranking only matters when the user has typed a search query. If the search input is empty, sort by whatever the existing default order is (creation time, or whatever it currently is). Don't change non-search behavior.

### 1.4 Update sortable-headers interaction

If the user clicks a column header to sort (existing functionality), that explicit sort overrides the relevance ranking. Search ranking is the default for "search active + no explicit sort," but the user's explicit sort always wins.

### 1.5 Section commit

```
feat(search): rank vocab search results by relevance (exact > whole-word > prefix > substring)
```

---

## Section 2 — Accent-agnostic search via normalized columns

### 2.1 Schema additions

Add two columns to `vocab_items`:

```ts
targetTextNormalized: text('target_text_normalized').notNull().default(''),
nativeTextNormalized: text('native_text_normalized').notNull().default(''),
```

Indexes on both, for fast LIKE/ILIKE prefix and substring matching:

```ts
// In schema.ts after the table definition
targetNormalizedIdx: index('vocab_target_normalized_idx').on(t.targetTextNormalized),
nativeNormalizedIdx: index('vocab_native_normalized_idx').on(t.nativeTextNormalized),
```

Migration: `pnpm db:generate && pnpm db:migrate`.

### 2.2 Normalization function

Create `src/lib/text-normalize.ts`:

```ts
/**
 * Normalize text for accent-agnostic search.
 *
 * 1. NFD decomposes accented characters into base + combining mark
 * 2. Strip combining marks (Unicode category Mn)
 * 3. Map custom IPA characters to their nearest Latin equivalents
 * 4. Lowercase
 *
 * Examples:
 *   "sǎai"   -> "saai"
 *   "krʉ̂ang" -> "krueang" (ʉ -> u, then combining mark stripped)
 *   "lɛ́ɔ"   -> "leo"
 *   "BPLƐƐ"  -> "bplee"
 */
export function normalizeText(input: string): string {
  if (!input) return '';

  // Pre-pass: replace custom IPA chars with Latin equivalents.
  // Done BEFORE decomposition since these aren't decomposable.
  const ipaMap: Record<string, string> = {
    'ɛ': 'e', 'Ɛ': 'e',
    'ʉ': 'u', 'Ʉ': 'u',
    'ɔ': 'o', 'Ɔ': 'o',
  };

  let result = input;
  for (const [src, dst] of Object.entries(ipaMap)) {
    result = result.replaceAll(src, dst);
  }

  // NFD decompose, then strip combining marks (Mn category)
  result = result.normalize('NFD').replace(/\p{Mn}/gu, '');

  return result.toLowerCase();
}
```

### 2.3 Populate normalized columns on write

In whatever insert/update path touches `vocab_items` (Drizzle `insert` / `update` calls, the CSV importer, the photo extraction save endpoint), set the normalized columns:

```ts
await db.insert(vocabItems).values({
  // ... existing fields
  targetText: row.targetText,
  nativeText: row.nativeText,
  targetTextNormalized: normalizeText(row.targetText),
  nativeTextNormalized: normalizeText(row.nativeText),
});
```

Same pattern for updates — whenever `targetText` or `nativeText` is updated, also update the corresponding normalized column.

### 2.4 Backfill existing data

After migration, run a one-time backfill. Create `scripts/backfill-normalized-text.ts`:

```ts
import { db } from '@/db';
import { vocabItems } from '@/db/schema';
import { normalizeText } from '@/lib/text-normalize';
import { eq, isNull, or } from 'drizzle-orm';

async function backfill() {
  // Update all rows
  const rows = await db.select({
    id: vocabItems.id,
    targetText: vocabItems.targetText,
    nativeText: vocabItems.nativeText,
  }).from(vocabItems);

  console.log(`Backfilling ${rows.length} rows...`);

  let updated = 0;
  for (const row of rows) {
    await db.update(vocabItems).set({
      targetTextNormalized: normalizeText(row.targetText),
      nativeTextNormalized: normalizeText(row.nativeText ?? ''),
    }).where(eq(vocabItems.id, row.id));
    updated++;
    if (updated % 100 === 0) console.log(`  ${updated}/${rows.length}`);
  }

  console.log(`Done. Updated ${updated} rows.`);
  process.exit(0);
}

backfill().catch((e) => { console.error(e); process.exit(1); });
```

Run it: `pnpm tsx scripts/backfill-normalized-text.ts`.

### 2.5 Update the search SQL to use normalized columns

The search WHERE clause uses normalized columns; the ranking SQL also uses them.

Update the query in 1.2 to use normalized columns for matching, but ORIGINAL columns for ranking tier (so "exact match" still means visually exact, not just normalized-exact):

```sql
-- Normalize the query in JS before passing to SQL
-- $qn = normalizeText(query)
-- $q = original query

SELECT v.*,
  CASE
    WHEN LOWER(v.target_text) = LOWER($q) OR LOWER(v.native_text) = LOWER($q) THEN 1
    WHEN v.target_text_normalized = $qn OR v.native_text_normalized = $qn THEN 2
      -- normalized exact match: e.g., search "saai" matches "sǎai"
    WHEN v.target_text_normalized ~* ('\m' || $regex_qn || '\M')
      OR v.native_text_normalized ~* ('\m' || $regex_qn || '\M') THEN 3
    WHEN v.target_text_normalized LIKE ($qn || '%')
      OR v.native_text_normalized LIKE ($qn || '%') THEN 4
    WHEN v.target_text_normalized LIKE ('%' || $qn || '%')
      OR v.native_text_normalized LIKE ('%' || $qn || '%') THEN 5
    ELSE 6
  END AS match_tier
FROM vocab_items v
WHERE v.user_id = $userId
  AND (
    v.target_text_normalized LIKE ('%' || $qn || '%')
    OR v.native_text_normalized LIKE ('%' || $qn || '%')
  )
ORDER BY match_tier ASC, LEAST(LENGTH(v.target_text), LENGTH(v.native_text)) ASC
```

Note: tier 1 is still "visually exact match on original text." Tier 2 is "exact match on normalized." This way, if the user types `sǎai`, the exact `sǎai` ranks above `saai`. If the user types `saai`, both `sǎai` and `saai` are tier 2 and the order is determined by length.

The WHERE clause uses normalized columns only — that's what makes the search accent-agnostic.

### 2.6 Section commit

```
feat(search): accent-agnostic search via normalized text columns + backfill
```

---

## Section 3 — Special character input: palette + hotkeys

### 3.1 The character set

Define in `src/lib/special-chars.ts`:

```ts
export const SPECIAL_CHAR_GROUPS = [
  {
    name: 'Vowels with háček',
    chars: ['ǎ', 'ě', 'ǐ', 'ǒ', 'ǔ', 'ʉ̌', 'ɛ̌', 'ɔ̌'],
  },
  {
    name: 'Vowels with acute',
    chars: ['á', 'é', 'í', 'ó', 'ú', 'ʉ́', 'ɛ́', 'ɔ́'],
  },
  {
    name: 'Vowels with grave',
    chars: ['à', 'è', 'ì', 'ò', 'ù', 'ʉ̀', 'ɛ̀', 'ɔ̀'],
  },
  {
    name: 'Vowels with circumflex',
    chars: ['â', 'ê', 'î', 'ô', 'û', 'ʉ̂', 'ɛ̂', 'ɔ̂'],
  },
  {
    name: 'Base IPA vowels',
    chars: ['ɛ', 'ʉ', 'ɔ'],
  },
];
```

### 3.2 Hotkey scheme

Define in the same file or a sibling:

```ts
/**
 * Hotkey replacement scheme.
 *
 * Tone marks (typed AFTER the base letter):
 *   `  + vowel → háček    (a` → ǎ)
 *   '  + vowel → acute     (a' → á)
 *   \  + vowel → grave     (a\ → à)
 *   ^  + vowel → circumflex (a^ → â)
 *
 * Base IPA letters (mnemonic: 6 = "expanded" letter):
 *   e6 → ɛ
 *   u6 → ʉ
 *   o6 → ɔ
 *
 * For accented IPA letters: combine both:
 *   e6` → ɛ̌
 *   u6' → ʉ́
 *   o6\ → ɔ̀
 */

interface HotkeyRule {
  match: string;       // sequence to match in input
  replace: string;     // what to replace it with
}

export const HOTKEY_RULES: HotkeyRule[] = [
  // Base IPA (must match before tone-mark combinations)
  { match: 'e6', replace: 'ɛ' },
  { match: 'u6', replace: 'ʉ' },
  { match: 'o6', replace: 'ɔ' },
  { match: 'E6', replace: 'Ɛ' },
  { match: 'U6', replace: 'Ʉ' },
  { match: 'O6', replace: 'Ɔ' },

  // Tone marks on regular vowels
  { match: 'a`', replace: 'ǎ' }, { match: 'A`', replace: 'Ǎ' },
  { match: 'e`', replace: 'ě' }, { match: 'E`', replace: 'Ě' },
  { match: 'i`', replace: 'ǐ' }, { match: 'I`', replace: 'Ǐ' },
  { match: 'o`', replace: 'ǒ' }, { match: 'O`', replace: 'Ǒ' },
  { match: 'u`', replace: 'ǔ' }, { match: 'U`', replace: 'Ǔ' },

  { match: "a'", replace: 'á' }, { match: "A'", replace: 'Á' },
  { match: "e'", replace: 'é' }, { match: "E'", replace: 'É' },
  { match: "i'", replace: 'í' }, { match: "I'", replace: 'Í' },
  { match: "o'", replace: 'ó' }, { match: "O'", replace: 'Ó' },
  { match: "u'", replace: 'ú' }, { match: "U'", replace: 'Ú' },

  { match: 'a\\', replace: 'à' }, { match: 'A\\', replace: 'À' },
  { match: 'e\\', replace: 'è' }, { match: 'E\\', replace: 'È' },
  { match: 'i\\', replace: 'ì' }, { match: 'I\\', replace: 'Ì' },
  { match: 'o\\', replace: 'ò' }, { match: 'O\\', replace: 'Ò' },
  { match: 'u\\', replace: 'ù' }, { match: 'U\\', replace: 'Ù' },

  { match: 'a^', replace: 'â' }, { match: 'A^', replace: 'Â' },
  { match: 'e^', replace: 'ê' }, { match: 'E^', replace: 'Ê' },
  { match: 'i^', replace: 'î' }, { match: 'I^', replace: 'Î' },
  { match: 'o^', replace: 'ô' }, { match: 'O^', replace: 'Ô' },
  { match: 'u^', replace: 'û' }, { match: 'U^', replace: 'Û' },

  // Tone marks on IPA letters (must come after base IPA rules)
  { match: 'ɛ`', replace: 'ɛ̌' }, { match: 'ʉ`', replace: 'ʉ̌' }, { match: 'ɔ`', replace: 'ɔ̌' },
  { match: "ɛ'", replace: 'ɛ́' }, { match: "ʉ'", replace: 'ʉ́' }, { match: "ɔ'", replace: 'ɔ́' },
  { match: 'ɛ\\', replace: 'ɛ̀' }, { match: 'ʉ\\', replace: 'ʉ̀' }, { match: 'ɔ\\', replace: 'ɔ̀' },
  { match: 'ɛ^', replace: 'ɛ̂' }, { match: 'ʉ^', replace: 'ʉ̂' }, { match: 'ɔ^', replace: 'ɔ̂' },
];

/**
 * Apply hotkey replacements to text, returning new text and new cursor position.
 * Only checks the last few characters before the cursor.
 */
export function applyHotkeys(text: string, cursorPos: number): { text: string; cursorPos: number } {
  // Check the 3 chars before cursor (longest hotkey is 3 chars)
  for (const rule of HOTKEY_RULES) {
    const startPos = cursorPos - rule.match.length;
    if (startPos < 0) continue;
    const candidate = text.slice(startPos, cursorPos);
    if (candidate === rule.match) {
      const newText = text.slice(0, startPos) + rule.replace + text.slice(cursorPos);
      const newCursorPos = startPos + rule.replace.length;
      return { text: newText, cursorPos: newCursorPos };
    }
  }
  return { text, cursorPos };
}
```

### 3.3 The hotkey-aware input component

Create `src/components/special-input.tsx`:

```tsx
'use client';

import { forwardRef, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Keyboard } from 'lucide-react';
import { applyHotkeys, SPECIAL_CHAR_GROUPS } from '@/lib/special-chars';

interface SpecialInputProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  // Allow the consumer to wire other input props
  [key: string]: unknown;
}

export const SpecialInput = forwardRef<HTMLInputElement, SpecialInputProps>(
  function SpecialInput({ value, onChange, placeholder, className, ariaLabel, ...rest }, externalRef) {
    const internalRef = useRef<HTMLInputElement>(null);
    const inputRef = (externalRef as React.RefObject<HTMLInputElement>) ?? internalRef;

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      const el = e.target;
      const newText = el.value;
      const cursorPos = el.selectionStart ?? newText.length;
      const { text, cursorPos: newPos } = applyHotkeys(newText, cursorPos);
      onChange(text);
      // Restore cursor position after React re-renders
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.setSelectionRange(newPos, newPos);
        }
      });
    }

    function insertChar(char: string) {
      const el = inputRef.current;
      if (!el) {
        onChange(value + char);
        return;
      }
      const start = el.selectionStart ?? value.length;
      const end = el.selectionEnd ?? value.length;
      const newText = value.slice(0, start) + char + value.slice(end);
      onChange(newText);
      requestAnimationFrame(() => {
        if (inputRef.current) {
          const newPos = start + char.length;
          inputRef.current.setSelectionRange(newPos, newPos);
          inputRef.current.focus();
        }
      });
    }

    return (
      <div className="flex gap-1">
        <Input
          ref={inputRef}
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          className={className}
          aria-label={ariaLabel}
          {...rest}
        />
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              title="Special characters"
              aria-label="Insert special character"
            >
              <Keyboard className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="space-y-3">
              {SPECIAL_CHAR_GROUPS.map((group) => (
                <div key={group.name}>
                  <div className="text-xs text-muted-foreground mb-1">{group.name}</div>
                  <div className="flex flex-wrap gap-1">
                    {group.chars.map((c) => (
                      <Button
                        key={c}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0 font-mono"
                        onClick={() => insertChar(c)}
                      >
                        {c}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="text-xs text-muted-foreground pt-2 border-t">
                Tip: type <code>a`</code> → <code>ǎ</code>, <code>a'</code> → <code>á</code>,
                <code> a\</code> → <code>à</code>, <code>a^</code> → <code>â</code>,
                <code> e6</code> → <code>ɛ</code>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    );
  }
);
```

### 3.4 Where to use it

Replace the standard `<Input>` with `<SpecialInput>` in these places:

**Vocab list search bar** — top of the vocab list page. The search field where the user types `sǎai`.

**Vocab add/edit form — target_text field** — the "Thai" input.

**Vocab add/edit form — transliteration field** — optional but also benefits from the palette.

**Photo extraction preview — target_text inline edit** — when the user clicks a Thai cell to edit it during review of extracted vocab.

Do NOT add it to:
- English / native_text inputs (no IPA chars expected)
- Lesson topic rich-text editor (Tiptap; the palette doesn't compose with rich text easily, and topics rarely need IPA)
- Lesson name input
- Settings inputs

If a field is currently a `<textarea>` rather than `<input>` (e.g., example sentences), wrap the textarea similarly — adapt the component to accept a `multiline` prop and render `<textarea>` instead.

### 3.5 Section commit

```
feat(input): special character palette + hotkey scheme for IPA/diacritic input
```

---

## Section 4 — Verification

### 4.1 Search ranking

- [ ] On `/language/th/vocab`, search for `sǎai`
- [ ] First result is the vocab item with target_text exactly `sǎai`
- [ ] Subsequent results contain `sǎai` as substring (e.g., sentences) or are translations matching
- [ ] Shorter matches rank above longer within same tier
- [ ] Clearing search → vocab returns to default sort order

### 4.2 Accent-agnostic search

- [ ] Search for `saai` (no diacritics) → finds `sǎai`
- [ ] Search for `ngʉa` (full IPA) → finds whatever your vocab has with `ngʉa`
- [ ] Search for `ngua` (Latinized) → finds same results
- [ ] Search for `mai` → finds `mâi`, `máai`, `mài`, etc.

### 4.3 SQL data verification

```bash
docker exec -i language-learning-bot-postgres-1 psql -U lang -d language_learning -c "
SELECT target_text, target_text_normalized
FROM vocab_items
WHERE user_id = (SELECT id FROM users WHERE email='matt@mattmcdonnell.net')
LIMIT 10;
" | cat
```

Verify the normalized column is populated for existing rows after backfill, and that the normalization is correct:
- `sǎai` → `saai`
- `krʉ̂angbin` → `krueangbin` (or similar — `ʉ → u`, circumflex stripped)
- `lɛ́ɔ` → `leo`

### 4.4 Hotkey input

- [ ] Open vocab edit page for any item
- [ ] In the Thai field, type `s a \` — should produce `sà`
- [ ] Type `e 6` — should produce `ɛ`
- [ ] Type `e 6 \`` — should produce `ɛ̌`
- [ ] Type a complete word: `s a \` a i` — should produce `sàai`
- [ ] Cursor position should remain natural during typing (no jumping)
- [ ] If you type a sequence that doesn't match any rule, normal input behavior continues

### 4.5 Palette input

- [ ] Click the keyboard icon next to the Thai field
- [ ] Popover appears with character groups
- [ ] Click `ǎ` → inserted at cursor position in the Thai input
- [ ] Click `ɛ̂` → inserted
- [ ] Popover stays open during clicks (so you can insert multiple)
- [ ] Click outside popover → closes

### 4.6 New vocab creation with special chars

- [ ] Create a new vocab item using ONLY hotkey input — `s a \` a i` for `sǎai`
- [ ] Save
- [ ] Search for `saai` — finds it (accent-agnostic)
- [ ] Edit the item — Thai field shows `sǎai` correctly
- [ ] Check normalized column in DB:
  ```bash
  docker exec -i language-learning-bot-postgres-1 psql -U lang -d language_learning -c "
  SELECT target_text, target_text_normalized FROM vocab_items
  WHERE target_text = 'sǎai' ORDER BY created_at DESC LIMIT 3;
  " | cat
  ```
  Both rows should have `saai` in the normalized column.

### 4.7 Automated checks

```bash
pnpm lint        # 0 errors
pnpm test        # all unit tests pass
pnpm build       # successful production build
```

Add unit tests:

`tests/unit/text-normalize.test.ts`:
- `normalizeText('sǎai')` → `'saai'`
- `normalizeText('krʉ̂angbin')` → `'krueangbin'`
- `normalizeText('lɛ́ɔ')` → `'leo'`
- `normalizeText('Hello')` → `'hello'`
- `normalizeText('')` → `''`
- Idempotent: `normalizeText(normalizeText('sǎai'))` === `normalizeText('sǎai')`

`tests/unit/hotkeys.test.ts`:
- `applyHotkeys('a`', 2)` → `{ text: 'ǎ', cursorPos: 1 }`
- `applyHotkeys('e6', 2)` → `{ text: 'ɛ', cursorPos: 1 }`
- `applyHotkeys('cat', 3)` → no change (no rule matches)
- `applyHotkeys('hello a\\', 8)` → `{ text: 'hello à', cursorPos: 7 }`

### 4.8 Update ERROR_REPORT.md

```markdown
## Search quality + special character input

### Changes
- Search results now ranked by relevance: exact > whole-word > prefix > substring, length tiebreaker
- Added target_text_normalized and native_text_normalized columns with indexes
- Normalization: NFD decompose + strip combining marks + map ɛ/ʉ/ɔ to e/u/o + lowercase
- Backfill script: scripts/backfill-normalized-text.ts (run via pnpm tsx)
- Search WHERE/ORDER use normalized columns for matching; ranking checks original text for visual-exact
- New <SpecialInput> component wraps Input/textarea with palette popover + inline hotkey replacement
- Hotkey scheme: `'\^` after vowel → háček/acute/grave/circumflex; `6` after e/u/o → ɛ/ʉ/ɔ
- SpecialInput applied to vocab search bar, vocab add/edit Thai field, transliteration, photo extraction inline edit

### Why
Search was sorted by DB order, making exact lookups frustrating. Accent input
was copy-paste-only. Three improvements together close the loop on text entry
and retrieval.

### Known follow-ups
- Hotkey scheme isn't customizable; users with strong opinions on Vietnamese-style IMEs would need extension points
- The palette doesn't yet handle Thai script — only romanized characters
```

### 4.9 Push

```bash
git push origin main
```

---

## Defaults you may apply silently

- Exact spacing/Tailwind classes for the palette popover
- Whether the Keyboard icon is on the left or right of the input
- Whether to show all 5 character groups always or paginate

## Things to check back on

- If the existing search query is built via Drizzle's query builder, the ranking CASE expression may need to be expressed via `sql\`...\`` template strings — adapt as needed
- If the search field is debounced, ensure debounce delay (~150-300ms) still feels responsive
- For backfill: if you have a lot of data and the script is slow, batch updates rather than per-row. For your scale (~2000 rows), per-row is fine.
- If hotkey replacement causes weird interactions with browser autocomplete or password managers — add `autoComplete="off"` to the SpecialInput

## Out of scope

- Customizable hotkey schemes
- Thai script input (separate IME concern)
- Fuzzy/typo-tolerant search (pg_trgm) — substring is enough for now
- Phonetic search ("sai" without tones finding all words with `s-VOWEL-i` patterns) — too vague
- Replacing all Inputs app-wide — only the listed fields

---

## End of spec

Start with Section 1. Commit per section. Update ERROR_REPORT.md at the end. Push to origin/main.