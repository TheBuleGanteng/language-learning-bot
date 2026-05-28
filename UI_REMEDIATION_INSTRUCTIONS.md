# UI Remediation Pass — Build Instructions

> Small follow-up spec. Five focused changes. Work in order, commit per section, push to origin/main at the end.

## Context

Base is `main`, post-lesson-pages build. This pass addresses observations from manual testing:

1. File delete needs confirmation dialog
2. Reorganize nav: Settings + Sign out into a user menu dropdown
3. Language dropdowns show `Name - CODE` format
4. Inline edit (pencil icon) for lesson detail fields
5. Compact drop zones for file uploads (currently take too much vertical space)
6. CSV import page file chooser button needs proper styling

(The "rename vocab to home" item from initial observations was withdrawn — do not rename.)

Project path: `/home/thebuleganteng/01_Repos/06_personal_work/language-learning-bot`
Branch: `main`

---

## Section 1 — File delete confirmation

### 1.1 The problem

Currently, clicking "Delete" on a PDF, audio file, or useful link in a lesson page triggers the delete immediately with no UI feedback. The user clicked twice, the second request returned "delete failed" (because the first had already succeeded), creating a confusing experience.

Vocab item delete already uses shadcn `AlertDialog` confirmation. We're applying that same pattern everywhere.

### 1.2 Apply AlertDialog to all file/link deletes

Wherever a file or link delete button exists in `src/app/(app)/language/[lang]/lessons/[lessonId]/...` (the lesson detail page), wrap the action in shadcn's `AlertDialog`:

```tsx
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50">
      Delete
    </Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete this {kind}?</AlertDialogTitle>
      <AlertDialogDescription>
        {/* Specific text per type below */}
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
        {isDeleting ? 'Deleting…' : 'Delete'}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### 1.3 Description text per type

- **PDF**: `"This will permanently delete "{filename}". This cannot be undone."`
- **Audio**: `"This will permanently delete "{filename}". This cannot be undone."`
- **Useful link**: `"This will permanently delete the link "{title}". This cannot be undone."`

### 1.4 Loading state during delete

While the delete is in-flight (between confirm click and server response):
- `Delete` button in the dialog shows `"Deleting…"` and is `disabled`
- The Cancel button is also `disabled` (otherwise the user can cancel mid-request, which doesn't actually abort the server call)
- On success: dialog closes, item disappears from the list
- On failure: dialog stays open, show an inline error message below the description: `"Delete failed. Please try again."` Reset button state so the user can retry.

### 1.5 Defense against double-submit

Even though the dialog prevents the original double-click problem, add a guard in the delete handler:

```tsx
const [isDeleting, setIsDeleting] = useState(false);

async function handleDelete() {
  if (isDeleting) return;
  setIsDeleting(true);
  try {
    await fetch(`/api/lessons/${lessonId}/files/${fileId}`, { method: 'DELETE' });
    // ... success handling
  } catch (err) {
    // ... error handling
  } finally {
    setIsDeleting(false);
  }
}
```

### 1.6 Section commit

```
fix(lessons): AlertDialog confirmation + loading state for file/link/audio deletes
```

---

## Section 2 — User menu dropdown in nav

### 2.1 Current state

The top nav currently shows (assumed): `[Vocab] [Lessons] [Settings] [user email] [Sign out]` — all left-aligned or with Sign out at the right.

### 2.2 Target state

```
[Vocab] [Lessons]                              [user@email.com ▾]
                                                ├─ Settings
                                                └─ Sign out
```

Specifics:
- Left side: `Vocab`, `Lessons` (in that order)
- Right side: User email as the trigger for a dropdown menu
- Email + chevron-down icon, styled as a `Button variant="ghost"` so it doesn't look like a primary action
- On click, shadcn `DropdownMenu` opens with two items:
  - `Settings` — links to `/settings`
  - `Sign out` — calls the existing sign-out action (Auth.js `signOut()` from `next-auth/react`)

### 2.3 Implementation

Find the existing nav component (likely `src/components/layout/nav.tsx` or similar). Replace the right-side items with:

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" className="gap-2">
      {session.user.email}
      <ChevronDown className="h-4 w-4" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuItem asChild>
      <Link href="/settings">
        <Settings className="mr-2 h-4 w-4" />
        Settings
      </Link>
    </DropdownMenuItem>
    <DropdownMenuItem onClick={() => signOut({ callbackUrl: '/' })}>
      <LogOut className="mr-2 h-4 w-4" />
      Sign out
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

Icons from `lucide-react`: `ChevronDown`, `Settings`, `LogOut`.

If `DropdownMenu` is not already installed:
```bash
pnpm dlx shadcn@latest add dropdown-menu
```

### 2.4 Remove standalone Settings link from nav

Wherever `Settings` currently appears as a standalone top-level nav link, remove it. It now lives only inside the user dropdown.

### 2.5 Remove standalone Sign Out button from nav

Same — wherever `Sign out` currently appears at the top level, remove it. Lives only inside the dropdown now.

### 2.6 Mobile considerations

The dropdown should still work on touch devices. shadcn's `DropdownMenu` (built on Radix) handles this natively — tap to open, tap-outside to close. If you discover an issue on mobile, document in ERROR_REPORT but ship.

### 2.7 Section commit

```
refactor(nav): consolidate Settings and Sign out into user menu dropdown
```

---

## Section 3 — Language dropdown format

### 3.1 Current state

Settings page target / native language dropdowns show only the language name (`Thai`, `English`).

### 3.2 Target state

Show `Name - CODE` format with uppercase code:
- `Thai - TH`
- `English - EN`
- `Chinese - ZH` (when enabled)
- etc.

### 3.3 Implementation

In `src/lib/languages.ts`, add a display helper:

```ts
export function languageDisplayLabel(code: LanguageCode): string {
  const lang = LANGUAGES.find(l => l.code === code);
  if (!lang) return code.toUpperCase();
  return `${lang.name} - ${code.toUpperCase()}`;
}
```

In the settings page, replace the `<SelectItem>` content for target and native language dropdowns:

```tsx
{LANGUAGES.map(lang => (
  <SelectItem
    key={lang.code}
    value={lang.code}
    disabled={lang.code !== 'th' && /* whatever existing logic */}
  >
    {languageDisplayLabel(lang.code)}
    {lang.code !== 'th' && <span className="text-muted-foreground"> (coming soon)</span>}
  </SelectItem>
))}
```

The disabled-with-"coming soon" pattern only applies to the target language dropdown (per existing v1 logic). Native language dropdown likely has more options enabled — preserve whatever existing logic is there for which codes are selectable.

### 3.4 Apply consistency wherever language names appear

Search for any UI that currently shows just the language name in isolation (e.g., a profile summary section, breadcrumb, badge). Wherever a language code is shown as a label in a list/dropdown context (not in flowing prose), prefer the `Name - CODE` format.

NOT in scope for this change:
- Vocab table column header (still reads "Thai" alone — that's a content-descriptive header, not a language picker)
- Lesson detail page header (similar — content context, not picker)

In prose / column headers: keep just `Thai`. In selectors / dropdown items / "your current language" indicators: use `Thai - TH`.

### 3.5 Section commit

```
feat(settings): show language code alongside name in dropdowns (e.g. "Thai - TH")
```

---

## Section 4 — Inline edit for lesson detail fields

### 4.1 Current state

Lesson detail page has an "Edit lesson details" button that opens a modal with Name, Topic, Date fields.

### 4.2 Target state

Remove the single modal button. Each field (Name, Topic, Date) is independently editable inline via a pencil icon.

### 4.3 The inline-edit component

Create a reusable `<InlineEdit>` component at `src/components/inline-edit.tsx`:

```tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface InlineEditProps {
  value: string | null;
  placeholder?: string;        // shown when value is empty
  onSave: (newValue: string) => Promise<void>;
  multiline?: boolean;
  className?: string;          // for styling the display element
}

export function InlineEdit({
  value,
  placeholder = 'Click to add',
  onSave,
  multiline = false,
  className = '',
}: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Re-sync draft when value prop changes (after successful save)
  useEffect(() => {
    if (!editing) setDraft(value ?? '');
  }, [value, editing]);

  // Click-outside cancels (does NOT save)
  useEffect(() => {
    if (!editing) return;
    function onDocClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        cancel();
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [editing]);

  function startEdit() {
    setDraft(value ?? '');
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setDraft(value ?? '');
    setError(null);
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    } else if (e.key === 'Enter' && !multiline) {
      e.preventDefault();
      save();
    } else if (e.key === 'Enter' && multiline && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      save();
    }
  }

  if (editing) {
    const InputElement = multiline ? 'textarea' : Input;
    return (
      <div ref={wrapperRef} className="inline-flex items-center gap-2">
        {multiline ? (
          <textarea
            autoFocus
            className="min-h-[80px] w-full rounded border px-2 py-1"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            disabled={saving}
          />
        ) : (
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            disabled={saving}
          />
        )}
        <Button size="icon" variant="ghost" onClick={save} disabled={saving}>
          <Check className="h-4 w-4 text-green-600" />
        </Button>
        <Button size="icon" variant="ghost" onClick={cancel} disabled={saving}>
          <X className="h-4 w-4 text-muted-foreground" />
        </Button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    );
  }

  const isEmpty = !value || value.trim() === '';
  return (
    <button
      type="button"
      onClick={startEdit}
      className={`group inline-flex items-center gap-2 text-left ${className}`}
    >
      <span className={isEmpty ? 'text-muted-foreground italic' : ''}>
        {isEmpty ? placeholder : value}
      </span>
      <Pencil className="h-3.5 w-3.5 opacity-30 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}
```

Key behaviors verified:
- Click pencil OR placeholder text → enters edit mode (whole element is the button)
- Enter saves (single-line); Cmd/Ctrl+Enter saves (multi-line); blur via outside-click cancels
- Escape cancels
- Empty value shows muted italic placeholder
- Pencil opacity is subtle by default (30%), prominent on hover (100%)

### 4.4 Date inline edit (separate component)

The date needs a popover calendar, not a text input. Create `<InlineDateEdit>` at `src/components/inline-date-edit.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';

interface InlineDateEditProps {
  value: Date | null;
  placeholder?: string;
  onSave: (newValue: Date | null) => Promise<void>;
  className?: string;
}

export function InlineDateEdit({
  value,
  placeholder = 'Click to add date',
  onSave,
  className = '',
}: InlineDateEditProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSelect(date: Date | undefined) {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(date ?? null);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    setSaving(true);
    try {
      await onSave(null);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  const isEmpty = !value;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`group inline-flex items-center gap-2 text-left ${className}`}
        >
          <span className={isEmpty ? 'text-muted-foreground italic' : ''}>
            {isEmpty ? placeholder : format(value, 'MMM d, yyyy')}
          </span>
          <Pencil className="h-3.5 w-3.5 opacity-30 group-hover:opacity-100 transition-opacity" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={value ?? undefined}
          onSelect={handleSelect}
          disabled={saving}
        />
        {value && (
          <div className="border-t p-2 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={clear}
              disabled={saving}
              className="text-red-600"
            >
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
```

Selecting a date saves immediately (no two-step confirm). The "Clear" button at the bottom removes the date.

### 4.5 API for partial field updates

Update PATCH `/api/lessons/[lessonId]` to support patching individual fields. Verify it already does this — the existing modal probably submits all three fields, but with partial updates each field comes in independently. The endpoint should:

- Accept any subset of `{ name, topic, date }`
- Validate present fields with Zod (name min length 1, topic optional, date is ISO date string or null)
- Update only the provided fields
- Return the updated lesson

Send `null` to explicitly clear topic or date.

### 4.6 Replace the modal in the lesson detail page

In `src/app/(app)/language/[lang]/lessons/[lessonId]/page.tsx` (or its client-side child component):

- Remove the "Edit lesson details" button and its modal entirely
- Replace the name, topic, and date in the page header with the inline-edit components:

```tsx
<div className="space-y-2">
  <InlineEdit
    value={lesson.name}
    onSave={async (newName) => {
      const res = await fetch(`/api/lessons/${lesson.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      if (!res.ok) throw new Error('Failed to update name');
      // Trigger router.refresh() or update local state
      router.refresh();
    }}
    className="text-3xl font-bold"
  />

  <InlineEdit
    value={lesson.topic}
    placeholder="No topic — click to add"
    multiline
    onSave={async (newTopic) => {
      const res = await fetch(`/api/lessons/${lesson.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: newTopic || null }),
      });
      if (!res.ok) throw new Error('Failed to update topic');
      router.refresh();
    }}
    className="italic text-muted-foreground"
  />

  <div className="flex items-center gap-4 text-sm text-muted-foreground">
    <InlineDateEdit
      value={lesson.date ? new Date(lesson.date) : null}
      onSave={async (newDate) => {
        const res = await fetch(`/api/lessons/${lesson.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: newDate ? newDate.toISOString().split('T')[0] : null }),
        });
        if (!res.ok) throw new Error('Failed to update date');
        router.refresh();
      }}
    />
    <span>·</span>
    <span>{vocabCount} vocab items</span>
  </div>
</div>
```

The vocab count is NOT editable. It's derived.

### 4.7 Verify keyboard accessibility

After implementation, manually test:
- Tab navigates to each pencil/placeholder
- Enter activates edit mode
- Within edit mode: Enter saves (or Cmd+Enter for textarea), Escape cancels
- After save/cancel, focus returns to the field

### 4.8 Section commit

```
feat(lessons): inline editing for name, topic, and date with pencil-icon affordance
```

---

## Section 5 — Compact drop zones

### 5.1 The problem

The drag-drop upload zones in Notes and Audio sections (and useful-links if applicable) are too tall and consume significant vertical real estate, especially noticeable when no files are uploaded yet or when there are several files already (the zone sits between the file list and the rest of the page).

### 5.2 Target sizing

Reduce the drop zone to a single-row affordance:

- **Height**: ~64px total (currently likely 150-200px)
- **Layout**: horizontal — icon on the left, instruction text in the middle, optional file-type/size hint on the right
- **Single line of text**: e.g., `"Drop PDF here or click to upload"` followed by `"Max 20MB"` in muted text

Example layout for the Notes drop zone:

```tsx
<div
  {...getRootProps()}
  className={`
    flex items-center justify-between gap-3
    px-4 py-3 rounded-md border-2 border-dashed
    cursor-pointer transition-colors
    ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-muted-foreground/60 hover:bg-muted/30'}
  `}
>
  <input {...getInputProps()} />
  <div className="flex items-center gap-3">
    <Upload className="h-5 w-5 text-muted-foreground" />
    <span className="text-sm">
      {isDragActive ? 'Drop to upload' : 'Drop PDF here or click to upload'}
    </span>
  </div>
  <span className="text-xs text-muted-foreground">Max 20MB</span>
</div>
```

Apply the equivalent treatment to the Audio drop zone with appropriate text: `"Drop audio file here or click to upload"` and `"Max 50MB · MP3, M4A, WAV, OGG"`.

### 5.3 Active upload state

When a file is uploading, the drop zone itself can stay the same height and show progress inside it (replace the instruction text with the filename + progress bar inline). Don't expand the zone vertically during upload.

```
[icon] uploading "lesson-notes.pdf" [====40%====]
```

### 5.4 Hover and drag-over states

- Default: muted dashed border, transparent background
- Hover: slightly more opaque border, subtle background tint
- Drag-over (file being dragged over the zone): primary-color border, light primary-color background tint
- These were probably already in place; just verify the new compact size still works with them

### 5.5 Apply consistently

Find every drag-drop upload zone in the project:
- `src/app/(app)/language/[lang]/lessons/[lessonId]/...` — Notes (PDFs) and Audio sections

The vocab CSV import drop zone on `/vocab/import` (or wherever it lives now) is NOT part of this change — it's used once for bulk import, lives on its own page, and a larger zone is appropriate there. Leave it alone.

### 5.6 Section commit

```
fix(lessons): compact single-row drop zones for PDF and audio uploads
```

---

## Section 6 — CSV import page: style the file chooser

### 6.1 The problem

On the CSV import page (`/language/[lang]/vocab/import` or wherever the Notion CSV import currently lives), the file picker uses the default browser `<input type="file">` styling. It renders as an unstyled "Choose File" button followed by "No file chosen" text — visibly inconsistent with the rest of the shadcn-themed UI.

Note the contrast in the user's screenshot: the "Import" button below is properly styled (grey-rounded shadcn button), but the file chooser above looks like a 1995 web form.

### 6.2 The standard fix

Hide the native file input and wrap it in a styled shadcn button. The clickable area looks like the rest of the app, but underlying behavior is identical.

```tsx
'use client';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';

export function FileChooser({
  accept,
  onFileChosen,
}: {
  accept: string;
  onFileChosen: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [filename, setFilename] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          setFilename(f?.name ?? null);
          onFileChosen(f);
        }}
      />
      <Button
        type="button"
        variant="outline"
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="mr-2 h-4 w-4" />
        Choose file
      </Button>
      <span className="text-sm text-muted-foreground">
        {filename ?? 'No file chosen'}
      </span>
    </div>
  );
}
```

Apply this in the import page in place of the raw `<input type="file">`.

### 6.3 Optional improvement: full drag-drop on this page

The CSV import page is the one place I explicitly told you NOT to convert to a compact drop zone in Section 5.5 — and that's still right. The bulk-import page benefits from a *prominent* drag-drop area because it's a one-time operation per user (or rare repeat operation).

If the page doesn't already have drag-drop on it (just a file picker), consider adding it using `react-dropzone` — full-width zone, ~150px tall, with the styled "Choose file" button inside it for keyboard / accessibility users:

```
┌─────────────────────────────────────────────────────────┐
│                                                          │
│       Drop your CSV file here                            │
│       or                                                 │
│       [📤 Choose file]                                   │
│                                                          │
│       Exported from Notion's Vocabulary database         │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

Use the same `react-dropzone` already installed for the lesson page uploads. Keep the description text from the existing page above the drop zone.

Skip this if the existing page already has a drag-drop area and only the button styling is the issue — in that case just do 6.2.

### 6.4 Section commit

```
fix(import): style file chooser button to match shadcn design system
```

---

## Section 7 — Verification

### 7.1 Manual checks

- [ ] Delete a PDF — AlertDialog opens with descriptive text, "Delete" button shows "Deleting…" during request, dialog closes on success
- [ ] Cancel a PDF delete — dialog closes, file remains
- [ ] Trigger a delete failure (e.g., disconnect network briefly) — error appears inside dialog, can retry
- [ ] Audio delete — same UX as PDF
- [ ] Useful link delete — same UX
- [ ] Vocab delete — still works (unchanged)
- [ ] Top nav: only Vocab and Lessons on left
- [ ] Top nav: user email on right with chevron-down
- [ ] Click user email → dropdown opens with Settings and Sign out
- [ ] Click Settings → navigates to /settings
- [ ] Click Sign out → signs out, redirects to /
- [ ] Settings page: target language dropdown shows "Thai - TH"
- [ ] Settings page: native language dropdown shows "English - EN"
- [ ] Lesson detail page: no "Edit lesson details" button visible
- [ ] Hover lesson name → pencil icon appears prominently
- [ ] Click pencil → input appears with current name
- [ ] Type new value, press Enter → saves, view returns to display mode
- [ ] Click pencil, press Escape → cancels without saving
- [ ] Click pencil, click somewhere else on the page → cancels without saving
- [ ] Lesson with no topic shows muted italic "No topic — click to add"
- [ ] Click that placeholder → enters edit mode
- [ ] Lesson with no date shows "Click to add date"
- [ ] Click pencil on date → calendar popover opens
- [ ] Pick a date → saves immediately, popover closes
- [ ] Reopen → "Clear" button at bottom — click → date becomes null
- [ ] Notes drop zone is compact (~64px tall, single row layout)
- [ ] Audio drop zone is compact (~64px tall, single row layout)
- [ ] Drop zone hover state still works
- [ ] Drag-over state still works (border + bg color change)
- [ ] Upload progress still visible inside compact zone
- [ ] CSV import page: "Choose file" button matches shadcn styling (outlined, upload icon)
- [ ] CSV import page: clicking the styled button opens the native file picker
- [ ] CSV import page: selecting a file shows the filename next to the button
- [ ] CSV import page: existing drag-drop (if any) still works
- [ ] Reload page after any save → values persist

### 7.2 Automated checks

```bash
pnpm lint        # 0 errors
pnpm test        # all unit tests pass
pnpm test:e2e    # E2E passes (the import step in E2E should still work — clicks the input, doesn't depend on visible styling)
pnpm build       # successful production build
```

### 7.3 Update ERROR_REPORT.md

Add a section:

```markdown
## UI remediation pass (post-lesson-pages)

### Changes
- AlertDialog confirmation for file/audio/link deletes; loading state during delete
- Consolidated Settings + Sign out into user dropdown menu on the right of the nav
- Language dropdowns show "Name - CODE" format (e.g., "Thai - TH")
- Inline editing (pencil icon) for lesson name, topic, and date; replaces modal
- Compact single-row drop zones for PDF and audio uploads (~64px tall, was ~150-200px)
- Styled file chooser button on CSV import page (matches shadcn design system)

### Issues hit
(record any during implementation)
```

### 7.4 Push

```bash
git push origin main
```

---

## Defaults you may apply silently

- Exact Tailwind classes / colors for pencil opacity, hover effects
- Whether the user dropdown opens up or down (let Radix decide based on viewport)
- Specific transition timings
- Whether to use `react-hook-form` or plain state for the inline edit components (plain state is fine)

## Things to check back on

- If updating the E2E test for the nav reorg breaks unexpectedly — fix and note in ERROR_REPORT
- If `Calendar` from shadcn isn't installed yet, run `pnpm dlx shadcn@latest add calendar popover`
- If `date-fns` isn't installed, run `pnpm add date-fns`
- If `signOut` from `next-auth/react` behaves differently than expected — use whatever the v5 docs currently document

---

## End of spec

Start with Section 1. Commit per section. Update ERROR_REPORT.md at the end. Push to origin/main.