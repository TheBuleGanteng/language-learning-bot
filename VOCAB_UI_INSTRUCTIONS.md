# Vocab UI Improvements — Build Instructions

> Read this entire document first. Work in the listed order. Update `ERROR_REPORT.md` as you go. Do not stop for permission prompts.

## Context

The base v1 build is on `main`. This task adds UI improvements to the vocab page (`/vocab`) and one related API change.

Project path: `/home/thebuleganteng/01_Repos/06_personal_work/language-learning-bot`
Current branch: `main`. Work directly on `main` (single-dev hobby project).
Commit frequently — at least once per numbered section below.

After all sections are done, push to `origin main`.

---

## Section 1 — Filter sidebar: accordions, search, select-all/clear

### 1.1 Convert "Lessons" and "Themes" into accordions

Use shadcn's `accordion` component. Install if not present:

```bash
pnpm dlx shadcn@latest add accordion
```

Both sections should be expandable/collapsible independently. Both default to **expanded** on first load (no jarring empty state when the user first lands on the page). Persist open/closed state to `localStorage` so the user's preference sticks across reloads. Keys: `lang.filters.lessons.open`, `lang.filters.themes.open`. Read-and-apply in a `useEffect` on mount.

### 1.2 Search box inside each accordion

Each accordion section (Lessons and Themes) has a search input at the top that filters the visible options client-side. Pure substring match, case-insensitive, on the option label. No debounce needed; the lists are small.

- Input is a shadcn `Input` with type=`text`, placeholder `"Filter lessons…"` (or `"Filter themes…"`).
- When the input has content, a small round `X` button appears on the right side of the input that clears the value on click.
- Use `lucide-react`'s `X` icon inside a small button positioned via `relative`/`absolute` Tailwind classes (or `pr-8` on the input + an absolutely-positioned button on the right).

If the filter input is non-empty and zero options match, show a faint placeholder text below the input: `"No matches"`.

### 1.3 Select all / Clear selection controls

Right below each search box (before the option list), two small text links/buttons side by side:

- **Select all** — sets all *currently visible* (i.e., filtered) options to selected
- **Clear selection** — deselects all options in this category (regardless of search filter)

Style as compact buttons or text links — shadcn `Button` with `variant="link"` and `size="sm"` is fine. Separate them visually with a `·` or `|` divider.

The semantic distinction: "Select all" respects the search filter (selects what you can see), "Clear selection" always clears everything (because the typical mental model of "clear" is "wipe the slate clean"). Add a `title` tooltip on "Select all" that says `"Selects all visible options"`.

### 1.4 Implementation notes

- Don't fetch all lessons/tags up-front beyond what's already done — the existing `/api/lessons` and `/api/tags` endpoints already return all of the user's. Filter and select-all are pure client-side.
- Each accordion section is its own component (e.g., `<FilterAccordion>`) parameterized by title, options, selected set, onChange. Don't duplicate code.

---

## Section 2 — Pill colors (lessons and tags)

### 2.1 Color hashing utility

Create `src/lib/colors.ts` with:

```ts
// Deterministic hash → palette index.
export function djb2Hash(s: string): number {
  let hash = 5381;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) + hash) ^ s.charCodeAt(i);
  }
  return Math.abs(hash);
}

// Lesson palette: 12 saturated, distinguishable colors.
// Use Tailwind class strings (text + background pairs) so styling is
// consistent with shadcn theme tokens.
export const LESSON_PALETTE: ReadonlyArray<{ bg: string; text: string; ring: string }> = [
  { bg: 'bg-sky-100',    text: 'text-sky-900',    ring: 'ring-sky-300' },
  { bg: 'bg-emerald-100',text: 'text-emerald-900',ring: 'ring-emerald-300' },
  { bg: 'bg-amber-100',  text: 'text-amber-900',  ring: 'ring-amber-300' },
  { bg: 'bg-rose-100',   text: 'text-rose-900',   ring: 'ring-rose-300' },
  { bg: 'bg-violet-100', text: 'text-violet-900', ring: 'ring-violet-300' },
  { bg: 'bg-cyan-100',   text: 'text-cyan-900',   ring: 'ring-cyan-300' },
  { bg: 'bg-lime-100',   text: 'text-lime-900',   ring: 'ring-lime-300' },
  { bg: 'bg-orange-100', text: 'text-orange-900', ring: 'ring-orange-300' },
  { bg: 'bg-pink-100',   text: 'text-pink-900',   ring: 'ring-pink-300' },
  { bg: 'bg-indigo-100', text: 'text-indigo-900', ring: 'ring-indigo-300' },
  { bg: 'bg-teal-100',   text: 'text-teal-900',   ring: 'ring-teal-300' },
  { bg: 'bg-fuchsia-100',text: 'text-fuchsia-900',ring: 'ring-fuchsia-300' },
];

// Tag palette: muted slate/stone/zinc-style. Same length so the modulo logic
// is identical. Slightly less saturated than lesson palette so the eye picks
// out lessons first.
export const TAG_PALETTE: ReadonlyArray<{ bg: string; text: string; ring: string }> = [
  { bg: 'bg-slate-100',  text: 'text-slate-700',  ring: 'ring-slate-200' },
  { bg: 'bg-stone-100',  text: 'text-stone-700',  ring: 'ring-stone-200' },
  { bg: 'bg-zinc-100',   text: 'text-zinc-700',   ring: 'ring-zinc-200' },
  { bg: 'bg-neutral-100',text: 'text-neutral-700',ring: 'ring-neutral-200' },
  { bg: 'bg-blue-50',    text: 'text-blue-800',   ring: 'ring-blue-200' },
  { bg: 'bg-green-50',   text: 'text-green-800',  ring: 'ring-green-200' },
  { bg: 'bg-yellow-50',  text: 'text-yellow-800', ring: 'ring-yellow-200' },
  { bg: 'bg-red-50',     text: 'text-red-800',    ring: 'ring-red-200' },
  { bg: 'bg-purple-50',  text: 'text-purple-800', ring: 'ring-purple-200' },
  { bg: 'bg-cyan-50',    text: 'text-cyan-800',   ring: 'ring-cyan-200' },
  { bg: 'bg-pink-50',    text: 'text-pink-800',   ring: 'ring-pink-200' },
  { bg: 'bg-orange-50',  text: 'text-orange-800', ring: 'ring-orange-200' },
];

export function colorForLesson(name: string) {
  return LESSON_PALETTE[djb2Hash(name) % LESSON_PALETTE.length];
}

export function colorForTag(name: string) {
  return TAG_PALETTE[djb2Hash(name) % TAG_PALETTE.length];
}
```

**Important**: because Tailwind's JIT scans source for class names statically, these dynamic class strings must appear in source code somewhere for Tailwind to include them in the build. The arrays above already do that. Just confirm `pnpm build` doesn't drop them. If it does, add a `tailwind.config.ts` `safelist` entry for these patterns:

```ts
safelist: [
  { pattern: /^bg-(sky|emerald|amber|rose|violet|cyan|lime|orange|pink|indigo|teal|fuchsia|slate|stone|zinc|neutral|blue|green|yellow|red|purple)-(50|100)$/ },
  { pattern: /^text-(sky|emerald|amber|rose|violet|cyan|lime|orange|pink|indigo|teal|fuchsia|slate|stone|zinc|neutral|blue|green|yellow|red|purple)-(700|800|900)$/ },
  { pattern: /^ring-(sky|emerald|amber|rose|violet|cyan|lime|orange|pink|indigo|teal|fuchsia|slate|stone|zinc|neutral|blue|green|yellow|red|purple)-(200|300)$/ },
],
```

### 2.2 Apply to the pills in the table

Wherever lesson and tag pills are rendered in the vocab table (and elsewhere — be thorough: search for usages of `<Badge>` or pill components on the vocab list page and the vocab detail/edit page):

- For each lesson pill, look up `colorForLesson(lesson.name)` and apply `${bg} ${text}` Tailwind classes. Keep existing typography/padding/rounded styles.
- For each tag pill, look up `colorForTag(tag.name)` and apply same way.

Filter sidebar pills (in the accordions) should **also** use these colors — that's actually where the color cue is most useful, because it gives visual continuity between the filter you clicked and the matching pills in the table.

### 2.3 Add a unit test

`tests/unit/colors.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { colorForLesson, colorForTag, djb2Hash } from '@/lib/colors';

describe('color palette', () => {
  it('returns the same color for the same input', () => {
    expect(colorForLesson('Lesson 5')).toEqual(colorForLesson('Lesson 5'));
    expect(colorForTag('food')).toEqual(colorForTag('food'));
  });

  it('returns different colors for different inputs (probabilistically)', () => {
    // Not strict — modulo collisions exist. Just smoke check.
    const colors = ['food', 'classifier', 'pronouns', 'questions', 'greetings'].map(colorForTag);
    const unique = new Set(colors.map(c => c.bg));
    expect(unique.size).toBeGreaterThanOrEqual(3);  // weak but non-trivial
  });

  it('hash is deterministic', () => {
    expect(djb2Hash('test')).toEqual(djb2Hash('test'));
  });
});
```

---

## Section 3 — Table improvements (header styling + sorting)

### 3.1 Header styling

The current header probably uses default shadcn `<TableHead>` styling. Beef it up:

- **Background**: distinct from rows — use `bg-muted` or `bg-slate-100` (whichever is consistent with the rest of the theme; check what shadcn's default Table looks like already).
- **Font weight**: `font-semibold` minimum.
- **Border bottom**: thicker than between body rows — `border-b-2`.
- **Sticky on scroll** if the table is in a scrollable container — use `sticky top-0` plus `bg-...` set, since sticky doesn't work without a background. This is a nice-to-have; if it complicates the layout, skip it and just do the visual styling.

Apply to all `<TableHead>` cells, not just sortable ones.

### 3.2 Column sorting (server-side)

**Sortable columns**: Thai, English, Lessons, Tags. NOT the Actions column.

**Sort states cycle on click**:
1. None (default — DB insertion order, i.e., `created_at ASC` or whatever the current default is)
2. Ascending
3. Descending
4. Back to None

Only **one column** can be sorted at a time. Clicking a new column resets the others.

**Indicator**: use `lucide-react` icons next to the column label:
- None: a faint `ChevronsUpDown` icon (low opacity, so columns visually look sortable)
- Ascending: solid `ChevronUp`
- Descending: solid `ChevronDown`

Make the entire `<TableHead>` clickable (cursor-pointer, hover background change).

### 3.3 URL state

Encode sort in URL query params so the state survives reload and is shareable:
- `?sort=thai&order=asc`
- `?sort=english&order=desc`
- No params = default order

Use Next.js `useSearchParams` + `useRouter` (App Router). On sort change, push a new URL with `router.push(...)` and re-fetch.

### 3.4 API changes

Update `/api/vocab` GET to accept query params:
- `sort`: one of `thai`, `english`, `lessons`, `tags`, or omitted
- `order`: `asc` or `desc`

Mapping to DB columns:
- `thai` → `vocab_items.target_text`
- `english` → `vocab_items.native_text`
- `lessons` → sort by the **first** associated lesson's name (subquery or JOIN with `MIN(lesson_name)` per vocab — see below)
- `tags` → sort by the first associated tag's name, similarly

For lessons and tags (M:N joins), use a correlated subquery:

```sql
ORDER BY (
  SELECT MIN(l.name)
  FROM vocab_lessons vl
  JOIN lessons l ON l.id = vl.lesson_id
  WHERE vl.vocab_item_id = vocab_items.id
) ASC NULLS LAST
```

This works correctly for items with multiple lessons (picks the alphabetically-first), and pushes items with no lesson to the bottom. Same pattern for tags.

In Drizzle, this is a `sql\`...\`` template or a `db.select` with a subquery. Use whatever is idiomatic for the codebase. If you find yourself fighting Drizzle's API, drop to raw SQL via `sql\`\``.

Update the existing `tests/unit/csv-import.test.ts` is unaffected. Add API smoke coverage:

`tests/unit/vocab-list-sort.test.ts` — a small test that ensures the sort param produces the expected ORDER BY. (Mock DB or check the generated query if Drizzle exposes a `toSQL()` helper. Skip if too fiddly; the E2E catches the user-visible behavior.)

### 3.5 E2E update

Update `tests/e2e/auth-and-vocab.spec.ts` to add steps:
1. After filtering shows expected items, click the "Thai" header
2. Verify the first row's Thai text changes (compare to baseline order)
3. Click again, verify it changes again
4. Click a third time, verify it returns to default

---

## Section 4 — Pagination (page size + load more)

### 4.1 Page size selector

Top of the vocab list (above the table, or in the same row as search/filter summary). A `Select` (shadcn) with options:
- `25`
- `50`
- `100` (default)
- `All`

Label: "Show:"

Selecting changes the URL param `pageSize=25|50|100|all` and re-fetches.

**Important**: `All` means literally all matching items. If a user has 1,858 items and filters to "all lessons all themes", `All` returns all 1,858. This will be slow. Add a note in `ERROR_REPORT.md` under "Known issues / deferred" that we should consider virtualizing the list for the `All` case later (use `@tanstack/react-virtual` or similar). For now, just render them all — it'll feel slow but won't crash.

### 4.2 Load more button

When `pageSize` is anything other than `All` AND there are more items than currently loaded, show a **"Load more"** button below the table. Clicking it loads the **next page worth** of items and appends them to the current list (does NOT replace — accumulates).

Implementation:
- Track loaded count in component state (or just track `currentPage` and let the fetch return `pageSize * currentPage` items each time — simpler).
- Use `cursor` or `offset` pagination at the API. Cursor (using `created_at` or sort key) is more correct under concurrent writes, but for this app `offset` is fine — there's only one writer (the user).
- After "Load more", scroll position should NOT jump. The new items append below; preserve scroll.

When all items are loaded, hide the "Load more" button (or show a faint `"All N items loaded"` text in its place).

When the user changes the page size, reset to page 1 and replace the list (don't append).

When the user changes a filter or sort, reset to page 1 and replace the list.

### 4.3 API changes

Update `/api/vocab` GET to accept:
- `pageSize`: integer 25/50/100, OR the literal string `all`
- `page`: integer ≥ 1, default 1

Backend treats `pageSize=all` as no LIMIT clause. For any other value, `LIMIT pageSize OFFSET (page - 1) * pageSize`.

Response shape should be:
```json
{
  "items": [...],
  "total": 1858,
  "page": 1,
  "pageSize": 100,
  "hasMore": true
}
```

`total` is the count of matching items after filtering (NOT after pagination). `hasMore` is `items.length + (page-1)*pageSize < total` — convenient for the frontend.

### 4.4 Show counts

Above the table, show: `"Showing X of Y items"` where X is the count of currently loaded rows and Y is the total. When `All` is selected: `"Showing all 1858 items"` (or however many).

---

## Section 5 — Edit button styling

The current edit button blends into the page background.

Use shadcn `Button` with `variant="secondary"` and `size="sm"`. If that's still too muted (likely is, since `secondary` is grey-on-grey), use `variant="outline"` with explicit color classes: `border-blue-300 text-blue-700 hover:bg-blue-50`.

If there's also a Delete button in the same row, give it a destructive accent: `variant="ghost" size="sm"` with `text-red-600 hover:bg-red-50 hover:text-red-700`. Don't make Delete fully red `variant="destructive"` — that's too loud for a per-row action.

Edit and Delete should sit close together in the Actions column, right-aligned.

---

## Section 6 — Polish + verification

### 6.1 Manual test pass

After all changes, open the vocab page and verify:

- [ ] Lessons accordion expands/collapses; state persists across reload
- [ ] Themes accordion expands/collapses; state persists across reload
- [ ] Lessons search filter narrows the visible options
- [ ] Lessons search X-button clears the input
- [ ] Themes search filter narrows the visible options
- [ ] Themes search X-button clears the input
- [ ] "Select all" in Lessons selects all visible-after-search
- [ ] "Clear selection" in Lessons clears all
- [ ] Same two for Themes
- [ ] Each Lesson pill has a color; multiple instances of the same lesson share the color
- [ ] Each Tag pill has a color; multiple instances of the same tag share the color
- [ ] Colors persist across reload (deterministic from name)
- [ ] Table header row visually distinct (bolder, shaded, thicker bottom border)
- [ ] Click Thai header → sort ascending; arrow indicator updates
- [ ] Click again → descending
- [ ] Click again → default order
- [ ] Same for English, Lessons, Tags columns
- [ ] Sort state in URL params; reload preserves it
- [ ] Only one column sortable at a time
- [ ] Page size selector at top: 25, 50, 100 (default), All
- [ ] Changing page size refetches and resets to page 1
- [ ] "Load more" appears when pageSize < total and there's more
- [ ] "Load more" appends, doesn't replace
- [ ] "Load more" disappears when all loaded
- [ ] When "All" is selected, no "Load more"
- [ ] Edit button visually distinct from background
- [ ] Delete button visually distinct (subtle red)
- [ ] "Showing X of Y items" text visible above table

### 6.2 Automated checks

```bash
pnpm lint        # 0 errors
pnpm test        # all unit tests pass (new colors test included)
pnpm test:e2e    # E2E passes with new sort steps
pnpm build       # successful production build
```

If any fail, fix and re-run. If after 3 attempts something is still broken, document in `ERROR_REPORT.md` and continue.

### 6.3 Commit and push

Commit per-section (at minimum 4-5 commits total). Suggested messages:

```
feat(vocab): accordion filter sidebar with search and select-all controls
feat(vocab): deterministic color palettes for lesson and tag pills
feat(vocab): sortable table columns with URL state
feat(vocab): paginated load with page size selector
chore(vocab): edit/delete button styling
```

Then `git push origin main`.

### 6.4 Update ERROR_REPORT.md

Add a section:

```markdown
## Vocab UI improvements (post-v1)

### Changes
- Filter sidebar: accordions, per-section search with clear button, select-all / clear-selection controls
- Pill coloring: deterministic palettes for lessons (12 saturated colors) and tags (12 muted colors)
- Table: distinct header styling; sortable columns (Thai, English, Lessons, Tags) cycling None → Asc → Desc → None; server-side sort with URL state
- Pagination: page size selector (25 / 50 / 100 default / All); cumulative "Load more" button
- Edit/Delete buttons: distinct colors

### Issues hit
(record any during implementation)

### Known follow-ups
- "All" page size renders 1858 rows without virtualization — could be slow on weak devices. Consider @tanstack/react-virtual later.
- Sorting by Lessons / Tags uses MIN(name) of joined rows — items with multiple lessons sort by alphabetically-first. Documented for users via tooltip on the column header.
```

---

## Defaults you may apply silently

- Specific Tailwind utility classes for spacing, hover states
- Whether to use `<button>` vs shadcn `<Button>` for tiny controls — pick what fits
- Order of "Select all" vs "Clear selection" in the UI
- Exact icon size/stroke for sort indicators
- Whether to use `localStorage` directly or wrap in a hook

## Things to check back on

- If Tailwind purges the palette classes despite the safelist hint — try the safelist config; if still purged, the colors must be wired via inline styles
- If the Drizzle subquery syntax for "sort by MIN(joined name)" gets ugly — drop to `sql\`...\`` raw
- If the existing E2E test breaks due to UI restructuring (button text changed, etc.) — update locators in the same commit as the UI change

---

## End of spec

Start with Section 1. Commit per section. Update ERROR_REPORT.md at the end with anything notable. Push to origin/main.