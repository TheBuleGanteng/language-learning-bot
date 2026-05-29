# New Lesson UX Fix — Build Instructions

> Two small fixes. One commit, push to origin/main.

## Context

Four issues to address:

1. After creating a new lesson, a noticeable delay before the lesson detail page renders. User is confused because they sit on the lessons index page for a moment with no feedback.
2. Tiptap warns about duplicate `link` and `underline` extensions:

   ```
   [browser] [tiptap warn]: Duplicate extension names found: ['link', 'underline']. This can lead to issues.
   ```

3. Lessons can only be created from the lessons index page. The common user workflow is "create lesson → immediately add vocab/files," so the vocab page (and the photo extraction flow specifically) need entry points to create a lesson without navigating away.

4. No way to delete a lesson. Lessons need a trash-icon affordance on the lessons index and a "Delete lesson" button on the lesson detail page. Deletion cascades to files/links and to vocab items that exist only in this lesson.

Project path: `/home/thebuleganteng/01_Repos/06_personal_work/language-learning-bot`
Branch: `main`

---

## Section 1 — Loading state during navigation to lesson detail

### 1.1 Add a Next.js loading.tsx at the lesson detail route

Next.js App Router shows `loading.tsx` automatically while the server component at the same route is loading data. This means any navigation to `/language/[lang]/lessons/[lessonId]` — from create, from clicking a row in the index, from a bookmark — shows the loading state during data fetch.

Create `src/app/(app)/language/[lang]/lessons/[lessonId]/loading.tsx`:

```tsx
import { Skeleton } from '@/components/ui/skeleton';

export default function LessonDetailLoading() {
  return (
    <div className="container mx-auto py-6 space-y-6 max-w-5xl">
      {/* Back link placeholder */}
      <Skeleton className="h-5 w-32" />

      {/* Header block: name + topic + meta */}
      <div className="space-y-3">
        <Skeleton className="h-10 w-1/2" />     {/* lesson name */}
        <Skeleton className="h-5 w-2/3" />      {/* topic */}
        <div className="flex gap-4">
          <Skeleton className="h-4 w-24" />     {/* date */}
          <Skeleton className="h-4 w-32" />     {/* vocab count */}
        </div>
      </div>

      {/* Accordion sections — 5 skeleton blocks */}
      <div className="space-y-3 pt-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}
```

If `Skeleton` isn't already in `src/components/ui/`, run:

```bash
pnpm dlx shadcn@latest add skeleton
```

The container/max-width classes should match what the actual lesson detail page uses. If the real page uses different wrapping (e.g., no container, full-width), adjust the skeleton to match so there's no layout jump when the real content renders.

### 1.2 Also improve the Save button feedback in the New Lesson modal

While creating a lesson, the Save button should immediately show feedback so the user knows the click registered (even before navigation begins):

In the create-lesson modal component, when Save is clicked:
- Disable the button
- Change label to `"Creating…"`
- Keep both states until either success (navigation starts) or error (button reverts, error shown)

This is in addition to the loading.tsx skeleton — they handle different parts of the perceived latency:
- The button state covers the time between click and the POST response (~100-300ms)
- The loading.tsx skeleton covers the time between navigation start and page render

Together: the user sees uninterrupted feedback from click to fully-rendered destination page.

### 1.3 Section commit

```
fix(lessons): add loading skeleton at detail route + "Creating…" button state during create
```

---

## Section 2 — Fix Tiptap duplicate extension warning

### 2.1 The bug

`@tiptap/starter-kit` (recent versions) includes `Link` and `Underline` by default. Our `src/components/rich-text-editor.tsx` explicitly imports and adds them too, creating duplicates.

### 2.2 The fix

In `src/components/rich-text-editor.tsx`, find the `useEditor({ extensions: [...] })` call. Currently looks like:

```ts
extensions: [
  StarterKit.configure({
    heading: false,
  }),
  Underline,
  Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-blue-600 underline' } }),
],
```

Change StarterKit's config to disable its bundled link and underline, since we want our custom-configured versions:

```ts
extensions: [
  StarterKit.configure({
    heading: false,
    link: false,       // we configure Link separately below
    underline: false,  // we use Underline separately below
  }),
  Underline,
  Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-blue-600 underline' } }),
],
```

The `openOnClick: false` is important — it prevents clicks on links from navigating during editing. We want to keep that customization, so we go with this approach rather than removing the explicit imports.

### 2.3 Verify

Reload any page that uses the rich-text editor (lesson topic edit or useful link notes). Open the browser console. The `[tiptap warn]: Duplicate extension names found` warning should be gone.

### 2.4 Section commit

```
fix(editor): disable StarterKit's bundled Link/Underline to avoid duplicate extensions
```

---

## Section 3 — Create new lesson from the vocab page

### 3.1 Why

The user's common workflow is: create a lesson → upload vocab and files. Forcing them to navigate to the lessons index first is friction. Two entry points needed:

**(a)** In the bulk-lesson picker of the photo extraction preview table (mid-flow lesson creation)
**(b)** A standalone "New Lesson" button on the vocab page toolbar (deliberate workflow start)

### 3.2 Refactor: extract <NewLessonDialog> into a reusable component

The lessons index page currently has a "New Lesson" button that opens a dialog with Name/Topic/Date fields and submits to `/api/lessons`. Extract that dialog into a reusable component if it isn't already.

Create `src/components/new-lesson-dialog.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/rich-text-editor';
import { lessonPath } from '@/lib/routes';

interface NewLessonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lang: string;
  /**
   * What to do after a successful create.
   * - 'navigate': push to the new lesson's detail page (default; matches lessons-index behavior)
   * - 'callback': call onCreated with the new lesson and don't navigate (used by the picker flow)
   */
  mode?: 'navigate' | 'callback';
  onCreated?: (lesson: { id: string; name: string }) => void;
}

export function NewLessonDialog({
  open, onOpenChange, lang, mode = 'navigate', onCreated,
}: NewLessonDialogProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [topicHtml, setTopicHtml] = useState('');
  const [date, setDate] = useState('');  // ISO date string, e.g., "2026-05-28"
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName('');
    setTopicHtml('');
    setDate('');
    setError(null);
    setSaving(false);
  }

  async function handleSave() {
    if (saving) return;
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/lessons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          topic: topicHtml || null,
          date: date || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to create lesson');
      }
      const lesson = await res.json();

      // Trigger any list refresh on the lessons index
      router.refresh();

      reset();
      onOpenChange(false);

      if (mode === 'callback') {
        onCreated?.(lesson);
      } else {
        router.push(lessonPath(lang, lesson.id));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create lesson');
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New Lesson</DialogTitle>
          <DialogDescription>
            Create a new lesson. You can add vocab, notes, audio, and links to it afterward.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label htmlFor="lesson-name">Name</Label>
            <Input
              id="lesson-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Lesson 35"
              autoFocus
              disabled={saving}
            />
          </div>
          <div className="space-y-1">
            <Label>Topic <span className="text-muted-foreground">(optional)</span></Label>
            <RichTextEditor value={topicHtml} onChange={setTopicHtml} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="lesson-date">Date <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              id="lesson-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={saving}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Creating…' : 'Create lesson'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

A few important things in this component:

- **Rich-text topic field**: uses `<RichTextEditor>` like the edit flow does. Matches user expectation that topics are rich text.
- **Two modes**: `navigate` (default, used by lessons index and vocab page standalone button) pushes to the new lesson's detail page. `callback` (used by the photo extraction picker) returns the new lesson via callback without navigating.
- **Form reset on close**: prevents stale state if the user opens the dialog again.
- **"Creating…" button state**: same pattern as Section 1.2 for consistency.
- **router.refresh() before any navigation**: ensures the lessons index reflects the new lesson if the user navigates back.

### 3.3 Update the lessons index to use this component

In `src/app/(app)/language/[lang]/lessons/page.tsx` (or its client child), replace the existing inline-defined create-lesson dialog with `<NewLessonDialog open={...} onOpenChange={...} lang={...} />` using `mode='navigate'` (the default).

The existing functionality should be unchanged from the user's perspective — same fields, same flow, just refactored into the reusable component.

### 3.4 Entry point (b): Standalone button on the vocab page

In the vocab page (`src/app/(app)/language/[lang]/vocab/page.tsx` or its client child), add a "New Lesson" button to the top toolbar:

```
[+ Add vocab] [📥 Import CSV] [🖼️ Generate Images] [📷 Add vocab from photo] [+ New Lesson]
```

Clicking it sets local state `newLessonOpen=true`, which opens `<NewLessonDialog open={newLessonOpen} onOpenChange={setNewLessonOpen} lang={lang} />` with default `mode='navigate'`. On save → navigates to the new lesson's detail page.

### 3.5 Entry point (a): "+ Create new lesson" in the picker

In the photo extraction preview component (`src/components/extracted-vocab-review.tsx` or wherever the bulk-lesson picker is defined), modify the lesson multi-select dropdown to include a "+ Create new lesson" option at the top.

Visual:

```
┌─ Apply lessons ─────────────────────┐
│ + Create new lesson                  │ ← always at top, separated by divider
│ ──────────────────────────────────── │
│ ☐ Lesson 1                           │
│ ☐ Lesson 2                           │
│ ☐ Lesson 3                           │
│ ☐ Lesson 4                           │
│ ...                                  │
└──────────────────────────────────────┘
```

Clicking "+ Create new lesson":

1. Opens `<NewLessonDialog open={true} mode='callback' onCreated={(lesson) => {...}} />`
2. User fills in Name (+ optional topic/date) and saves
3. Dialog closes
4. The `onCreated` callback receives the new lesson
5. The callback adds the new lesson to the picker's local options list and pre-selects it (checks the box)
6. The picker remains open so the user can also select other existing lessons if desired

Implementation note: the picker needs to maintain a local list of "all lessons" that starts from the server-fetched list and accepts additions. When the dialog calls `onCreated`, append the new lesson to that local list. The lesson is now selectable in the picker and starts pre-selected.

When the user finishes the bulk-apply (clicks Apply), the new lesson is included in the lessons assigned to selected rows. On save, the existing save flow handles it normally.

### 3.6 Section commit

```
feat(lessons): create new lesson from vocab page (standalone button + inline in extraction picker)
```

---

## Section 4 — Lesson deletion

### 4.1 Behavior

A user can delete a lesson, which:
- Permanently deletes the lesson row
- Permanently deletes the lesson's PDFs, audio files (from storage), and useful links
- Removes the lesson association from vocab items
- Permanently deletes vocab items that belong **only** to this lesson (and their generated images)
- Vocab items that belong to other lessons too are preserved (just lose their association with this lesson)

This is the safer semantics. A word taught in Lesson 5 and re-taught in Lesson 17 stays in your vocab when Lesson 5 is deleted; it just loses the Lesson 5 association.

### 4.2 API endpoint

Create `DELETE /api/lessons/[lessonId]`.

**Pre-deletion summary endpoint**: `GET /api/lessons/[lessonId]/deletion-preview` returns counts of what would be affected, used to populate the confirmation dialog:

```json
{
  "lessonName": "Lesson 5",
  "vocabReassignedCount": 12,
  "vocabDeletedCount": 18,
  "pdfCount": 2,
  "audioCount": 1,
  "linkCount": 3,
  "imageCount": 14
}
```

Where:
- `vocabReassignedCount` = vocab items in this lesson that also belong to ≥1 other lesson (will lose this lesson's association but remain)
- `vocabDeletedCount` = vocab items in this lesson with no other lesson association (will be permanently deleted)
- `pdfCount`, `audioCount`, `linkCount` = lesson_files (pdf/audio) and lesson_links counts
- `imageCount` = number of completed images among the `vocabDeletedCount` items (since those images are also deleted)

The query for `vocabDeletedCount`:

```sql
SELECT COUNT(*) FROM vocab_items vi
WHERE vi.id IN (
  SELECT vocab_item_id FROM vocab_lessons WHERE lesson_id = $lessonId
)
AND NOT EXISTS (
  SELECT 1 FROM vocab_lessons vl2
  WHERE vl2.vocab_item_id = vi.id AND vl2.lesson_id != $lessonId
)
```

`vocabReassignedCount` = `(total vocab in this lesson) - vocabDeletedCount`.

### 4.3 The deletion transaction

`DELETE /api/lessons/[lessonId]` runs in a single DB transaction:

1. Identify vocab items that belong only to this lesson (the `vocabDeletedCount` set)
2. For those items, collect their image storage keys
3. Delete those vocab items (cascades delete `vocab_tags`, `vocab_lessons`, `item_performance`, `image_generation_log` rows)
4. Delete the lesson's `lesson_files` rows (collect storage keys first)
5. Delete the lesson's `lesson_links` rows
6. Delete the lesson row (cascades to remaining `vocab_lessons` join rows, removing this lesson's association from preserved vocab items)
7. **Outside the transaction** (after commit): delete the collected file storage keys (lesson files + vocab images) from storage. If storage deletion fails for some files, log the error but don't fail the request — the DB is the source of truth, and orphaned storage files are recoverable later via a cleanup script.

Return the same summary structure used by the preview endpoint, so the client can show "Deleted N vocab items, removed M associations, etc." in a toast on success.

### 4.4 The confirmation dialog

Create `src/components/delete-lesson-dialog.tsx`. Triggered from two entry points (Section 4.5 and 4.6).

When opened:
1. Calls `GET /api/lessons/[lessonId]/deletion-preview` to fetch counts
2. Shows the dialog with the counts populated

Dialog content:

```
┌─ Delete "Lesson 5"? ────────────────────────────────┐
│                                                      │
│ This will permanently delete this lesson:            │
│                                                      │
│   • 2 PDF notes                                      │
│   • 1 audio file                                     │
│   • 3 useful links                                   │
│   • 18 vocab items (only in this lesson)             │
│   • 14 generated images (for those vocab items)      │
│                                                      │
│ And reassign:                                        │
│                                                      │
│   • 12 vocab items shared with other lessons         │
│     (kept, but no longer associated with Lesson 5)   │
│                                                      │
│ ⚠ This action cannot be undone.                     │
│                                                      │
│                          [Cancel]   [Delete lesson]  │
└──────────────────────────────────────────────────────┘
```

Show counts even when zero (e.g., "0 PDF notes") — clearer than hiding the row.

If preview fetch fails: show error message in dialog, only Cancel is enabled.

While the preview is loading, show a small spinner inside the dialog body.

### 4.5 Loading state during deletion

When the user confirms, deletion can take a few seconds (multiple storage deletes, cascading DB deletes). The user needs feedback.

In the dialog:
- Both buttons become disabled
- "Delete lesson" button changes to "Deleting…" with a spinner icon
- After completion, the dialog closes
- On success: navigate to lessons index (if user was on the lesson detail page) or stay on lessons index (if they were already there); show a toast: "Lesson 'X' deleted. 18 vocab items removed, 12 vocab items kept."
- On error: dialog stays open, shows error message, buttons re-enabled for retry

If the user was on the lesson detail page when they deleted (entry point 4.6), the navigation back to `/language/[lang]/lessons` should use the loading.tsx skeleton on that route (will need to create one — see Section 4.7).

### 4.6 Entry points

**Entry point A: Lessons index — trash icon per row**

In the lessons index table (`src/app/(app)/language/[lang]/lessons/page.tsx`), add a rightmost column for the delete action. The chevron-right indicator (from previous spec) goes immediately before; the trash icon is the very rightmost.

Approximate row structure:

```
| Name | Topic | Date | Vocab | (chevron) | (trash) |
```

The trash icon:
- Always visible (no hover-dependent display)
- Small `Trash2` icon from lucide-react
- `text-red-600` on hover, `text-muted-foreground/40` default (subtle until hovered)
- `cursor-pointer`
- `aria-label="Delete lesson"`
- On click: opens `<DeleteLessonDialog>` for that lesson
- **`onClick` must call `e.stopPropagation()`** so the row's click-to-navigate doesn't fire

**Entry point B: Lesson detail page — near the edit area**

On the lesson detail page, near the existing inline-edit area for name/topic/date, add a "Delete lesson" button. Place it discreetly — small, red, near the bottom of the header block. Not the first thing the user sees.

Suggested placement: a small `Button variant="ghost"` with red text, with the trash icon and "Delete lesson" label, right-aligned below the name/topic/date metadata block.

On click: opens `<DeleteLessonDialog>` for the current lesson. On confirm + success: navigate to `/language/[lang]/lessons` (skeleton displayed during navigation).

### 4.7 Loading skeleton for lessons index

Since deleting from the lesson detail page navigates back to the lessons index, also add a skeleton for that route. Less critical than the detail page one but consistent.

Create `src/app/(app)/language/[lang]/lessons/loading.tsx`:

```tsx
import { Skeleton } from '@/components/ui/skeleton';

export default function LessonsIndexLoading() {
  return (
    <div className="container mx-auto py-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-32" />        {/* "Lessons" title */}
        <Skeleton className="h-10 w-32" />       {/* "New Lesson" button */}
      </div>

      {/* Table skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />     {/* header row */}
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}
```

### 4.8 Section commit

```
feat(lessons): delete lesson with cascade to vocab/files/links and confirmation preview
```

---

## Section 5 — Verification

### 5.1 Test plan

**Loading state:**

- [ ] Go to `/language/th/lessons`
- [ ] Click "New Lesson" → modal opens (now with rich-text topic editor)
- [ ] Enter a name (e.g., "Lesson 99 test"), optionally a topic with bullets/formatting, optionally a date
- [ ] Click Save
- [ ] **Immediate**: button shows "Creating…" and is disabled
- [ ] **During navigation**: skeleton placeholder visible at the lesson detail URL (instead of the empty lessons index)
- [ ] **Page rendered**: lesson detail page appears with the new lesson's data
- [ ] No visual gap / no "sitting on lessons index" moment

**Skeleton on other navigation paths:**

- [ ] Click a lesson row in the lessons index → skeleton briefly visible, then detail page
- [ ] Navigate directly to a lesson URL → skeleton briefly visible, then detail page

**Tiptap warning:**

- [ ] Open browser DevTools → Console
- [ ] Navigate to a lesson's detail page where topic is editable
- [ ] Click pencil on topic → rich-text editor modal opens
- [ ] Console: no `[tiptap warn]: Duplicate extension names found` warning
- [ ] Editor functions normally: bold, italic, bullet list, link insertion all work

**New lesson dialog improvements:**

- [ ] Lessons index "New Lesson" button now opens dialog with rich-text topic editor
- [ ] Can format topic with bold, bullets, etc.
- [ ] Saving navigates to new lesson detail page with loading skeleton

**Vocab page → standalone New Lesson button:**

- [ ] Go to `/language/th/vocab`
- [ ] Top toolbar shows "New Lesson" button alongside existing buttons
- [ ] Click → same dialog as lessons index opens
- [ ] Fill in fields, save → navigates to the new lesson's detail page

**Vocab page → create lesson inline during photo extraction:**

- [ ] Go to `/language/th/vocab` (or any lesson page)
- [ ] Click "Add vocab from photo" → upload, extract
- [ ] In the preview table, open the bulk Lessons picker
- [ ] At the top of the dropdown: "+ Create new lesson" option visible
- [ ] Click it → New Lesson dialog opens
- [ ] Fill in Name + Topic + Date, save
- [ ] Dialog closes
- [ ] The new lesson appears in the picker's list, already checked
- [ ] User remains in the preview table (no navigation away)
- [ ] Continue to apply the lesson to selected rows + save
- [ ] After save, new vocab is correctly associated with the new lesson

**Lesson deletion — lessons index:**

- [ ] On `/language/th/lessons`, each row shows a trash icon at the right end
- [ ] Trash icon is muted by default, red on hover
- [ ] Click trash → dialog opens with "Loading..." briefly, then populates with counts
- [ ] Counts shown: PDFs, audio, links, vocab-deleted, vocab-reassigned, images
- [ ] Click Cancel → dialog closes, lesson still exists
- [ ] Click trash on same row again → dialog re-opens
- [ ] Click "Delete lesson" → button changes to "Deleting…" with spinner
- [ ] After completion, dialog closes
- [ ] Row disappears from the table
- [ ] Toast appears: "Lesson 'X' deleted. N vocab items removed, M vocab items kept."

**Lesson deletion — detail page:**

- [ ] Open a lesson detail page
- [ ] Near the name/topic/date edit area, "Delete lesson" button visible
- [ ] Click → confirmation dialog opens with same content as index entry point
- [ ] Confirm delete → button shows "Deleting…"
- [ ] After completion, navigate to lessons index (with loading skeleton during navigation)
- [ ] Lessons index loads, deleted lesson is gone
- [ ] Toast appears with deletion summary

**Lesson deletion — data integrity:**

- [ ] Create a test lesson "Lesson DEL TEST"
- [ ] Add 5 vocab items to it (only this lesson)
- [ ] Add 3 vocab items that already exist in other lessons (so they're shared)
- [ ] Upload a small PDF and an audio file to it
- [ ] Add a useful link
- [ ] Delete the lesson
- [ ] Verify: 5 vocab items deleted; 3 vocab items still exist (now without this lesson's association)
- [ ] Verify: PDF, audio, link gone from DB and from storage (check `./storage/...`)
- [ ] Verify with SQL:
  ```bash
  docker exec -i language-learning-bot-postgres-1 psql -U lang -d language_learning -c \
    "SELECT COUNT(*) FROM lessons WHERE name = 'Lesson DEL TEST';" | cat
  ```
  Expected: 0
- [ ] Verify the 3 shared vocab items have correct lesson associations after deletion

**Lesson deletion — edge cases:**

- [ ] Try to delete a lesson with 0 vocab items, 0 files, 0 links — works, counts all 0
- [ ] Click trash icon → confirm `e.stopPropagation()` works: clicking trash does NOT navigate to the lesson detail page

### 5.2 Automated checks

```bash
pnpm lint        # 0 errors
pnpm test        # 61/61 still passing (or more if new tests added)
pnpm build       # successful production build
```

### 5.3 Update ERROR_REPORT.md

Append:

```markdown
## Post-test fixes + new-lesson-from-vocab-page + lesson deletion

### Changes
- Added loading.tsx skeleton at /language/[lang]/lessons/[lessonId] for smooth navigation
- Added loading.tsx skeleton at /language/[lang]/lessons (lessons index)
- New lesson modal Save button shows "Creating…" state during request
- Disabled StarterKit's bundled Link/Underline extensions (already imported separately)
- Refactored New Lesson dialog into reusable <NewLessonDialog> component with rich-text topic editor
- Added standalone "New Lesson" button on vocab page toolbar
- Added "+ Create new lesson" option in the bulk-lesson picker of the photo extraction preview
- Added DELETE /api/lessons/[id] with cascading file/image deletion
- Added GET /api/lessons/[id]/deletion-preview for confirmation dialog counts
- Trash icon on each lessons-index row (always visible, muted → red on hover)
- "Delete lesson" button on lesson detail page near edit area
- Confirmation dialog shows itemized counts (vocab deleted vs. reassigned, files, links, images)
- "Deleting…" button state during cascade

### Why
The user's workflow expects deletion to be possible from anywhere a lesson
is presented. The cascade behavior keeps shared vocab safe — vocab items
that appear in multiple lessons survive deletion of one parent lesson.
```

### 5.4 Push

```bash
git push origin main
```

---

## Defaults you may apply silently

- Exact heights / widths of skeleton blocks (the example above is a starting point)
- Whether to use shadcn's `<Skeleton>` or hand-roll with Tailwind animate classes
- Whether to use a spinner icon inside the "Creating…" button

## Things to check back on

- If the lesson detail page uses Suspense boundaries internally, those will work alongside loading.tsx — no conflict
- If the existing create-lesson modal already handles Save button state, just verify the wording matches ("Creating…" vs "Saving…" — pick one and use it consistently)

---

## End of spec

One commit per section, push when done.