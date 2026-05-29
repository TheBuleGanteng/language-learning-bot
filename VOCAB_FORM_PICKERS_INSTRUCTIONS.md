# Vocab Form Pickers Fix — Build Instructions

> Replaces the single-lesson dropdown and comma-separated tag input on the vocab add/edit form with multi-select pickers consistent with the photo-extraction picker. Three sections, single commit per section, push to origin/main.

## Context

The vocab edit form (and presumably the vocab add form) has two outdated fields:

1. **Lesson** — a single-value dropdown that doesn't open (UI bug) AND doesn't support the data model's many-to-many relationship (semantic bug)
2. **Tags** — a comma-separated text input, clunky compared to the multi-select pickers used elsewhere

The photo extraction flow already has reusable multi-select pickers with create-new support. We're aligning the edit form to that same UX.

Project path: `/home/thebuleganteng/01_Repos/06_personal_work/language-learning-bot`
Branch: `main`

## Affected pages

- `/language/[lang]/vocab/[id]` — vocab edit
- `/language/[lang]/vocab/new` — vocab add (single item)

Both should receive the same upgrades.

---

## Section 1 — Diagnose and refactor toward shared pickers

### 1.1 Read the existing code first

Find the components currently used for the bulk-lesson and bulk-tag pickers in the photo extraction preview (`src/components/extracted-vocab-review.tsx` or wherever the bulk picker UI lives). They should already exist as either:

- Inline components within the preview
- Extracted reusable components (preferred — easier to share)

Goal: extract them (if not already extracted) into `src/components/lesson-picker.tsx` and `src/components/tag-picker.tsx`, then reuse on the vocab forms.

If they're already extracted, just import and use them. Write findings to ERROR_REPORT.md describing what was found.

### 1.2 The picker component interfaces

The shared `<LessonPicker>` accepts:

```ts
interface LessonPickerProps {
  selectedLessonIds: string[];
  onChange: (ids: string[]) => void;
  // For "+ Create new lesson" support:
  lang: string;
  // Existing lessons fetched server-side or via SWR/react-query — implementation detail
  // (Whichever pattern the existing picker uses; don't change it unnecessarily.)
}
```

The shared `<TagPicker>` accepts:

```ts
interface TagPickerProps {
  selectedTagIds: string[];
  onChange: (ids: string[]) => void;
}
```

Both render:
- Current selections as removable pills (use the existing color palette — `colorForLesson` / `colorForTag`)
- A dropdown/popover trigger to add more
- Inside the popover: a search input + checkboxes list of existing options + at the top, a "+ Create new {lesson|tag}" option

When "+ Create new lesson" is clicked, opens the existing `<NewLessonDialog>` in `callback` mode. The new lesson is added to the local options list and auto-selected.

When "+ Create new tag" is clicked, opens a small inline input (or tiny dialog) for the tag name. The new tag is POSTed to `/api/tags`, added to the local options list, and auto-selected.

### 1.3 Section commit

```
refactor(pickers): extract LessonPicker and TagPicker as shared components
```

---

## Section 2 — Apply pickers to the vocab edit form

### 2.1 The edit form

Open `src/app/(app)/language/[lang]/vocab/[id]/...` (the edit page). It currently has:

```tsx
<div>
  <label>Lesson (existing or new)</label>
  <select>...</select>  // or some other broken dropdown
</div>
<div>
  <label>Tags (comma-separated)</label>
  <input type="text" ... />
</div>
```

Replace with:

```tsx
<div>
  <label>Lessons</label>  {/* note: plural */}
  <LessonPicker
    selectedLessonIds={selectedLessonIds}
    onChange={setSelectedLessonIds}
    lang={lang}
  />
</div>
<div>
  <label>Tags</label>
  <TagPicker
    selectedTagIds={selectedTagIds}
    onChange={setSelectedTagIds}
  />
</div>
```

The labels lose the parentheticals ("existing or new", "comma-separated") — the picker UI is self-explanatory.

### 2.2 Backend: PATCH should accept arrays for lessons and tags

The PATCH `/api/vocab/[id]` endpoint may currently accept a single `lessonId` and a comma-separated `tags` string. Update it to accept:

```ts
{
  // ... other fields
  lessonIds?: string[];   // full replacement set
  tagIds?: string[];      // full replacement set
}
```

The semantic: if `lessonIds` is present in the PATCH, the vocab's lesson associations are replaced with that exact set. Same for `tagIds`. If a field is absent, it's not modified. If a field is `[]`, all associations are cleared.

Implementation: in a transaction, DELETE from `vocab_lessons` WHERE `vocab_item_id = ?`, then INSERT new rows for each provided ID. Same for `vocab_tags`.

### 2.3 Loading the existing values

When the edit page mounts, it loads the vocab item. Make sure the response includes:
- `lessons`: array of `{ id, name }` (probably already does)
- `tags`: array of `{ id, name }` (probably already does)

The form initializes `selectedLessonIds` and `selectedTagIds` from these arrays.

### 2.4 Section commit

```
fix(vocab): edit form uses multi-select pickers for lessons and tags (UI bug + M:N semantics)
```

---

## Section 3 — Apply pickers to the vocab add form

### 3.1 The add form

`src/app/(app)/language/[lang]/vocab/new/...` — same treatment. Fields go from single-lesson + comma-separated-tags to the multi-select pickers.

If the add form currently has different state shape, normalize it to the same `selectedLessonIds: string[]` and `selectedTagIds: string[]`.

### 3.2 Backend: POST `/api/vocab` should accept arrays

Mirror the PATCH changes — accept `lessonIds: string[]` and `tagIds: string[]` in the POST body. Empty arrays are allowed (no associations).

### 3.3 Section commit

```
fix(vocab): add form uses multi-select pickers for lessons and tags
```

---

## Section 4 — Verification

### 4.1 Edit form test

- [ ] Navigate to any vocab item's edit page
- [ ] "Lessons" field (plural label) shows current lesson(s) as pills
- [ ] Lessons picker opens when clicked (UI bug fixed)
- [ ] Inside picker: search input, "+ Create new lesson" at top, checkboxes for existing lessons
- [ ] Click an existing lesson to add → pill appears on the form
- [ ] Click X on a pill → that lesson is removed
- [ ] Click "+ Create new lesson" → NewLessonDialog opens → fill in name, save
- [ ] New lesson appears in the picker and is added to the current vocab item
- [ ] Same flow works for Tags
- [ ] Save → both lessons and tags persist correctly
- [ ] Reload edit page → all selections still shown

### 4.2 Add form test

- [ ] Navigate to vocab add page
- [ ] Fill in Thai and English
- [ ] Add 2-3 lessons via picker
- [ ] Add 2-3 tags via picker (use "+ Create new tag" for one to test create-new)
- [ ] Save → redirects to vocab list
- [ ] Find the new item in the list → has the correct lesson and tag pills

### 4.3 Multi-lesson cascade verification

This is the test that was blocked by the original bug. Now do it.

1. Pick a vocab item from your list (e.g., `sǎai / line / route` from Lesson 19 — its UUID is `0e87d623-c33a-41ef-9b08-db8380e3100e` from the earlier session)
2. Open its edit page
3. **Lessons field should show Lesson 19** as a pill (current association)
4. Click the picker → add `TEST DELETE` (the test lesson you already created)
5. Save
6. SQL check:

   ```bash
   docker exec -i language-learning-bot-postgres-1 psql -U lang -d language_learning -c "
   SELECT v.target_text, l.name
   FROM vocab_items v
   JOIN vocab_lessons vl ON vl.vocab_item_id = v.id
   JOIN lessons l ON l.id = vl.lesson_id
   WHERE v.id = '0e87d623-c33a-41ef-9b08-db8380e3100e';
   " | cat
   ```

   Should show two rows: Lesson 19 and TEST DELETE.

7. Now go delete TEST DELETE via the trash icon in lessons index
8. Verify the deletion preview shows "1 vocab item shared with other lessons (kept)"
9. Confirm delete
10. Re-run the SQL above. Should show one row: only Lesson 19. The vocab still exists.

### 4.4 Automated checks

```bash
pnpm lint        # 0 errors
pnpm test        # 61/61 still passing
pnpm build       # successful production build
```

### 4.5 Update ERROR_REPORT.md

Append:

```markdown
## Vocab form pickers fix

### Changes
- Extracted LessonPicker and TagPicker into shared reusable components
- Vocab edit form: replaced broken single-lesson dropdown with LessonPicker (multi-select with pills)
- Vocab edit form: replaced comma-separated tags input with TagPicker (multi-select with pills)
- Vocab add form: same picker treatment
- PATCH /api/vocab/[id] and POST /api/vocab now accept lessonIds: string[] and tagIds: string[]
- Lesson/tag association is full-replacement semantic: provided array replaces existing set

### Why
The vocab edit form was inconsistent with the rest of the app: it treated lessons
and tags as single-value fields despite the M:N data model. Also the lesson
dropdown had a UI bug preventing it from opening at all. Fixed both by aligning
to the picker pattern used elsewhere (photo extraction).
```

### 4.6 Push

```bash
git push origin main
```

---

## Defaults you may apply silently

- Tailwind/styling choices that match existing pickers
- Exact placeholder text in the search inputs
- Loading states during create-new operations
- Auto-focus behavior in the search input on picker open

## Things to check back on

- If the existing pickers in extraction flow use a specific library (cmdk, downshift, custom popover) — reuse that same library for consistency. Don't introduce a new dependency.
- If the existing API routes already accept array fields and the form was just hardcoded to single — even less to change. Adapt.

## Out of scope

- Other vocab form fields (Thai, English, Transliteration, POS, Examples, Notes) — leave alone
- Bulk vocab editing (e.g., select multiple vocab items and apply tags) — separate feature, not in this pass

---

## End of spec

Start with Section 1 (read existing picker code, extract if needed). Commit per section. Update ERROR_REPORT.md. Push to origin/main.