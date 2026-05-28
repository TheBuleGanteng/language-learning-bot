# UI Polish Pass 3 — Build Instructions

> Small focused spec. Four discrete improvements. Work in order, commit per section, push to origin/main at the end.

## Context

Base is `main`, post-UI-remediation. This pass addresses four observations from testing:

1. Settings dropdowns show only the raw code (`th`, `en`) after selection — should show formatted label
2. Settings dropdowns should auto-save; Save button removed (except per-API-key)
3. Lessons index rows and vocab-table lesson pills need clickability affordance
4. Rich-text editor (Tiptap) for lesson topic and useful-link notes

Project path: `/home/thebuleganteng/01_Repos/06_personal_work/language-learning-bot`
Branch: `main`

---

## Section 1 — Fix language dropdown selected value display

### 1.1 The problem

In the settings page, the language dropdowns currently show only the raw language code (`th`, `en`) once selected, even though dropdown items show the full formatted label (`Thai - TH`, `English - EN`). This is a shadcn `Select` quirk: by default, `<SelectValue>` displays the bare `value` prop unless you provide custom rendering or wrap each item's display value.

### 1.2 The fix

In the settings page (likely `src/app/(app)/settings/page.tsx` or its client component), find the target and native language `<Select>` components. The `<SelectValue>` needs to render `languageDisplayLabel(selectedCode)` instead of the raw value.

There are two clean ways to do this:

**Approach A** (preferred): use a controlled component where `<SelectValue>` doesn't render the value at all; instead, manually render the selected label in the trigger:

```tsx
<Select value={targetLang} onValueChange={handleTargetChange}>
  <SelectTrigger>
    <SelectValue>
      {languageDisplayLabel(targetLang as LanguageCode)}
    </SelectValue>
  </SelectTrigger>
  <SelectContent>
    {LANGUAGES.map(lang => (
      <SelectItem
        key={lang.code}
        value={lang.code}
        disabled={lang.code !== 'th'}
      >
        {languageDisplayLabel(lang.code)}
        {lang.code !== 'th' && <span className="text-muted-foreground"> (coming soon)</span>}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

The `children` passed to `<SelectValue>` override the default-bare-value rendering.

**Approach B**: pass each `<SelectItem>` a custom `textValue` so Radix uses that for the trigger display. More fiddly and version-dependent; stick with A.

Apply the same fix to the native language dropdown.

### 1.3 Verify

After implementation: load `/settings`, the target language field should display `"Thai - TH"`, native language should display `"English - EN"`. Open the dropdown — items still show full labels. Click an item — trigger updates to show the full label.

### 1.4 Section commit

```
fix(settings): show full "Name - CODE" label in selected language dropdowns
```

---

## Section 2 — Auto-save settings dropdowns

### 2.1 The problem

Currently, the Languages section and the LLM provider section both require clicking a "Save" button to persist changes. This adds friction for trivial-feeling selections.

### 2.2 The target behavior

- Selecting a value in the **target language** dropdown → immediately PATCH `/api/settings`
- Selecting **native language** → immediately PATCH
- Selecting **LLM provider** → immediately PATCH (and auto-select the provider's default model, also persisted)
- Selecting **LLM model** → immediately PATCH

After each save: show a transient "Saved" indicator next to the field, visible for ~1.5 seconds, then fades out. Use a small green check icon plus the word "Saved" — subtle, not a toast.

If save fails: show a transient "Failed to save" indicator (red), no toast. The user can re-try by changing the value again.

### 2.3 The Save button

Remove the Save button from both the Languages and LLM provider sections.

The Save button on API key fields stays — those are text inputs that shouldn't save on every keystroke.

### 2.4 Implementation pattern

A small "useAutoSave" hook is helpful:

```tsx
function useFieldAutoSave<T>(
  onSave: (value: T) => Promise<void>
) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  async function save(value: T) {
    setStatus('saving');
    try {
      await onSave(value);
      setStatus('saved');
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setStatus('idle'), 1500);
    } catch {
      setStatus('error');
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setStatus('idle'), 2000);
    }
  }

  return { status, save };
}
```

And a status indicator component:

```tsx
function SaveStatus({ status }: { status: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (status === 'idle') return null;
  if (status === 'saving') return <span className="text-xs text-muted-foreground">Saving…</span>;
  if (status === 'saved') return <span className="text-xs text-green-600 inline-flex items-center gap-1"><Check className="h-3 w-3" /> Saved</span>;
  return <span className="text-xs text-red-600">Failed to save</span>;
}
```

Place the status indicator next to the field label (right-aligned within the field row).

### 2.5 Provider → model coupling

When the user changes the LLM provider, also reset the model to that provider's default and save both in a single PATCH (don't make two round-trips). This means the PATCH body for a provider change is `{ llmProvider: newProvider, llmModel: defaultModelFor(newProvider) }`.

### 2.6 Section commit

```
feat(settings): auto-save language and LLM dropdowns with transient status indicator
```

---

## Section 3 — Clickability affordances

### 3.1 Lessons index rows

In `src/app/(app)/language/[lang]/lessons/page.tsx` (or its client component), the table rows should signal clickability to both desktop and mobile users.

Apply these changes to each row:

1. **Wrap the row content in a `<Link>`** if not already — semantically correct, gives free behavior (right-click to open in new tab, accessibility, etc.). If wrapping `<tr>` is awkward, wrap each `<td>`'s content. Easiest: make the entire row a `<Link>` with `className="contents"` so it doesn't break the table layout, OR use `router.push` on row click (less semantic but simpler with table HTML).
2. **Cursor pointer**: `cursor-pointer` on the row
3. **Hover state** (desktop): `hover:bg-muted/50`
4. **Active state** (mobile tap feedback): `active:bg-muted/70`
5. **Lesson name styled as a link** in the Name column: subtle link color (e.g., `text-blue-700 dark:text-blue-400`) and `hover:underline`
6. **Trailing chevron-right icon** in a new rightmost column: a small muted `ChevronRight` from `lucide-react`, visible on every row. This is the universal mobile "tap to drill in" pattern (iOS Settings, Android lists, etc.). Use `text-muted-foreground/40` so it's there but not loud.

Example row structure:

```tsx
<TableRow
  onClick={() => router.push(lessonPath(lang, lesson.id))}
  className="cursor-pointer hover:bg-muted/50 active:bg-muted/70 transition-colors"
>
  <TableCell>
    <span className="font-medium text-blue-700 hover:underline">
      {lesson.name}
    </span>
  </TableCell>
  <TableCell>{lesson.topic ? <RenderedHtml html={lesson.topic} /> : <span className="text-muted-foreground">—</span>}</TableCell>
  <TableCell>{lesson.date ? formatDate(lesson.date) : <span className="text-muted-foreground">—</span>}</TableCell>
  <TableCell className="text-right tabular-nums">{lesson.vocabCount}</TableCell>
  <TableCell className="w-8">
    <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
  </TableCell>
</TableRow>
```

Note about the Topic cell: after Section 4, lesson topics may contain HTML. For the index table, render the topic as plain text by stripping HTML tags (use a `stripHtml` utility) — keeps the row compact. If the topic is empty, show `—`.

### 3.2 Lesson pills in the vocab table

In the vocab table component, lesson pills are currently styled `Badge` elements that show the lesson name. Make them clickable links to that lesson's detail page.

Find where pills are rendered (likely in a component that maps over `vocab.lessons` for each row):

```tsx
{vocab.lessons.map(lesson => (
  <Link
    key={lesson.id}
    href={lessonPath(lang, lesson.id)}
    className="inline-block"
    onClick={(e) => e.stopPropagation()}  // don't trigger row-level click handlers
  >
    <Badge
      className={`${colorForLesson(lesson.name).bg} ${colorForLesson(lesson.name).text} hover:underline cursor-pointer transition-opacity hover:opacity-80`}
    >
      {lesson.name}
    </Badge>
  </Link>
))}
```

The `e.stopPropagation()` matters: if the vocab table row has its own click handler (e.g., to navigate to vocab edit), the pill click shouldn't bubble to it.

Add the same treatment in any other place lesson pills are rendered (e.g., if vocab cards have them on mobile, or the lesson-scoped vocab table within the lesson detail page).

**Note**: tag pills (themes) are NOT clickable in this pass. There's no "tag detail page" to navigate to. Only lesson pills become links.

### 3.3 Section commit

```
feat(ui): clickability affordances for lesson rows and vocab-table lesson pills
```

---

## Section 4 — Rich text editor for topic and useful-link notes

### 4.1 Scope

Apply Tiptap rich-text editor (in a modal) to two fields:
- Lesson **topic** (currently a plain string)
- Useful link **notes** (currently a plain string)

NOT in scope:
- Lesson name (plain text only)
- Lesson date (date picker)
- Vocab notes (existing field is unused; defer)
- Anywhere else

### 4.2 Install Tiptap

```bash
pnpm add @tiptap/react @tiptap/starter-kit @tiptap/extension-link @tiptap/extension-underline
pnpm add isomorphic-dompurify
```

Notes on packages:
- `@tiptap/starter-kit` includes the common extensions: paragraph, bold, italic, bullet list, ordered list, heading, hard-break, history (undo/redo), etc.
- `@tiptap/extension-link` for link insertion
- `@tiptap/extension-underline` because underline is not in StarterKit (it's controversial in semantic HTML; we include it because users expect it)
- `isomorphic-dompurify` for sanitizing HTML on render

### 4.3 The rich text editor component

Create `src/components/rich-text-editor.tsx`:

```tsx
'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import { Button } from '@/components/ui/button';
import {
  Bold, Italic, Underline as UnderlineIcon,
  List, ListOrdered, IndentIncrease, IndentDecrease,
  Link as LinkIcon, Undo2, Redo2,
} from 'lucide-react';

interface RichTextEditorProps {
  value: string;                    // HTML
  onChange: (html: string) => void;
  placeholder?: string;
}

export function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // disable heading sizes we don't want
        heading: false,
      }),
      Underline,
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-blue-600 underline' } }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none min-h-[200px] focus:outline-none p-3',
      },
    },
    immediatelyRender: false,  // avoid SSR hydration mismatch
  });

  if (!editor) return null;

  const promptForLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('URL', prev ?? 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div className="border rounded-md">
      <div className="flex flex-wrap items-center gap-1 border-b p-1 bg-muted/30">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          label="Bold"
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          label="Italic"
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive('underline')}
          label="Underline"
        >
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          label="Bullet list"
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
          label="Numbered list"
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().sinkListItem('listItem').run()}
          disabled={!editor.can().sinkListItem('listItem')}
          label="Indent"
        >
          <IndentIncrease className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().liftListItem('listItem').run()}
          disabled={!editor.can().liftListItem('listItem')}
          label="Outdent"
        >
          <IndentDecrease className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton
          onClick={promptForLink}
          active={editor.isActive('link')}
          label="Link"
        >
          <LinkIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          label="Undo"
        >
          <Undo2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          label="Redo"
        >
          <Redo2 className="h-4 w-4" />
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function ToolbarButton({
  onClick, active, disabled, label, children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? 'secondary' : 'ghost'}
      size="sm"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="h-7 w-7 p-0"
    >
      {children}
    </Button>
  );
}

function ToolbarDivider() {
  return <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />;
}
```

### 4.4 The HTML render component

Create `src/components/rendered-html.tsx`:

```tsx
import DOMPurify from 'isomorphic-dompurify';

export function RenderedHtml({ html, className }: { html: string; className?: string }) {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'a'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
  });
  return (
    <div
      className={`prose prose-sm max-w-none ${className ?? ''}`}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
```

The whitelist matches what the editor produces. Anything else gets stripped.

Also create `src/lib/strip-html.ts`:

```ts
import DOMPurify from 'isomorphic-dompurify';

export function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  // Strip all tags, return plain text
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}
```

This is what the lessons index uses for the Topic column (plain text only, since the cell is small).

### 4.5 The edit modal

Create `src/components/rich-text-edit-modal.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Pencil } from 'lucide-react';
import { RichTextEditor } from './rich-text-editor';
import { RenderedHtml } from './rendered-html';

interface RichTextEditModalProps {
  value: string;                        // HTML
  emptyPlaceholder?: string;
  title: string;                        // modal title
  onSave: (newHtml: string) => Promise<void>;
  className?: string;                   // wraps the display element
}

export function RichTextEditModal({
  value, emptyPlaceholder = 'Click to add', title, onSave, className,
}: RichTextEditModalProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset draft when modal opens
  useEffect(() => {
    if (open) {
      setDraft(value);
      setError(null);
    }
  }, [open, value]);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const isEmpty = !value || stripHtml(value).trim() === '';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={`group inline-flex items-start gap-2 text-left w-full ${className ?? ''}`}
        >
          {isEmpty ? (
            <span className="text-muted-foreground italic">{emptyPlaceholder}</span>
          ) : (
            <RenderedHtml html={value} />
          )}
          <Pencil className="h-3.5 w-3.5 mt-1 opacity-30 group-hover:opacity-100 transition-opacity shrink-0" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <RichTextEditor
          value={draft}
          onChange={setDraft}
          placeholder="Start typing…"
        />
        {error && <div className="text-sm text-red-600">{error}</div>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Import `stripHtml` from `@/lib/strip-html`.

### 4.6 Use it for lesson topic

In the lesson detail page, find the existing `<InlineEdit>` for topic (created in the prior UI remediation pass). Replace it with `<RichTextEditModal>`:

```tsx
<RichTextEditModal
  value={lesson.topic ?? ''}
  emptyPlaceholder="No topic — click to add"
  title="Edit lesson topic"
  onSave={async (newHtml) => {
    const res = await fetch(`/api/lessons/${lesson.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: newHtml || null }),
    });
    if (!res.ok) throw new Error('Failed to update topic');
    router.refresh();
  }}
  className="italic text-muted-foreground"
/>
```

Name and date keep their `InlineEdit` / `InlineDateEdit` components. Only topic upgrades to rich text.

### 4.7 Use it for useful-link notes

In the useful-links section of the lesson page, the existing "Add link" form has a Notes textarea. Replace it with `<RichTextEditor>` for the form, and use `<RenderedHtml>` to display notes on each link card.

Form changes:
- The Notes textarea becomes a `<RichTextEditor value={notes} onChange={setNotes} />` inline within the form
- The form's submit handler sends `notes` as HTML to the API

Display changes on each link card:
- Where the link notes are currently rendered as plain text, use `<RenderedHtml html={link.notes} />`

If there's an existing "edit link" flow, also wire it up; if not (and links are currently delete-and-re-add only per the original lesson-pages spec), no further changes needed.

### 4.8 Lessons index — render topic as plain text

In the lessons index page, the Topic column shows the topic text. After this change topics may contain HTML; strip it for display in the table cell:

```tsx
<TableCell>
  {lesson.topic
    ? <span className="line-clamp-2">{stripHtml(lesson.topic)}</span>
    : <span className="text-muted-foreground">—</span>}
</TableCell>
```

`line-clamp-2` truncates at two lines with ellipsis if it's long.

### 4.9 Tailwind: ensure prose styles work

The `prose` class comes from `@tailwindcss/typography`. If not already installed:

```bash
pnpm add -D @tailwindcss/typography
```

And add to `tailwind.config.ts`:

```ts
plugins: [require('@tailwindcss/typography')],
```

Verify by rendering a bullet list in the topic field — bullets should appear.

### 4.10 Existing data compatibility

Existing lesson topics are plain strings. Plain text is also valid HTML (renders as a single paragraph). No migration needed.

If you want to be extra safe, you could wrap existing topics in `<p>` tags on first read, but it's unnecessary — browsers handle plain text inside `dangerouslySetInnerHTML` fine.

### 4.11 Section commit

```
feat(editor): Tiptap rich-text editor for lesson topic and useful-link notes
```

---

## Section 5 — Verification

### 5.1 Manual checks

- [ ] Settings: target language dropdown shows "Thai - TH" once selected (not just "th")
- [ ] Settings: native language dropdown shows "English - EN"
- [ ] Settings: changing target language saves immediately, "Saved" indicator briefly appears, no Save button click needed
- [ ] Settings: changing native language same behavior
- [ ] Settings: changing provider saves immediately AND auto-selects that provider's default model (also saved)
- [ ] Settings: changing model saves immediately
- [ ] Settings: Save button no longer present in Languages or LLM provider sections
- [ ] Settings: Save button still present on each API key field
- [ ] Lessons index: rows have hover background (desktop), cursor pointer, lesson name is link-styled
- [ ] Lessons index: trailing chevron-right on every row
- [ ] Lessons index: clicking anywhere on row navigates to lesson detail
- [ ] Lessons index: on mobile (or browser dev-tools touch emulation), tapping a row works
- [ ] Vocab table: lesson pills now look like links (subtle hover state, cursor pointer)
- [ ] Vocab table: clicking a lesson pill navigates to that lesson's detail page
- [ ] Vocab table: clicking a tag pill does NOT navigate (tags remain non-clickable)
- [ ] Lesson detail: pencil on Topic opens modal with rich-text editor
- [ ] Editor: bold, italic, underline, bullet list, numbered list, indent, outdent, link, undo, redo all work
- [ ] Editor: save persists; reload shows rendered HTML correctly
- [ ] Editor: cancel discards changes
- [ ] Useful link form: notes field is a rich-text editor
- [ ] Useful link card: notes render as formatted HTML
- [ ] Lessons index: topics with HTML render as plain text (no `<p>` tags visible) with line-clamp-2
- [ ] Existing lessons whose topic is plain text still render correctly (no broken display)

### 5.2 Automated checks

```bash
pnpm lint        # 0 errors
pnpm test        # all unit tests pass (add a small test for stripHtml)
pnpm test:e2e    # E2E passes
pnpm build       # successful production build
```

Add a small unit test:

`tests/unit/strip-html.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { stripHtml } from '@/lib/strip-html';

describe('stripHtml', () => {
  it('returns empty for null/undefined/empty', () => {
    expect(stripHtml(null)).toBe('');
    expect(stripHtml(undefined)).toBe('');
    expect(stripHtml('')).toBe('');
  });
  it('strips all tags', () => {
    expect(stripHtml('<p>hello <strong>world</strong></p>')).toBe('hello world');
  });
  it('handles nested lists', () => {
    expect(stripHtml('<ul><li>one</li><li>two</li></ul>')).toContain('one');
    expect(stripHtml('<ul><li>one</li><li>two</li></ul>')).toContain('two');
  });
});
```

### 5.3 Update ERROR_REPORT.md

Add a section:

```markdown
## UI polish pass 3 (post-UI-remediation)

### Changes
- Fix language dropdown trigger to show "Name - CODE" (not just bare code)
- Auto-save for language and LLM dropdowns; Save button removed except per-API-key
- Lessons index rows: clickability affordance (hover, cursor, link-styled name, trailing chevron)
- Vocab-table lesson pills: clickable links to lesson detail
- Tiptap rich-text editor (modal) for lesson topic and useful-link notes
- HTML render uses isomorphic-dompurify sanitization with strict allowlist (p/br/strong/em/u/ul/ol/li/a)
- Lessons index renders HTML topics as plain text via stripHtml + line-clamp-2

### Issues hit
(record any during implementation)

### Known follow-ups
- Vocab notes column is unused; could become rich-text in a later pass
- A "general lesson notes" field (separate from PDFs) was discussed; deferred
- Tag pill clickability deferred (no tag detail page yet)
```

### 5.4 Push

```bash
git push origin main
```

---

## Defaults you may apply silently

- Specific Tailwind classes for spacing/colors
- Exact icon size/style choices
- Whether to truncate the lessons-index topic at 1 or 2 lines (use 2 — gives more context)
- Modal width for the rich-text editor (max-w-2xl is suggested but tweak as needed)
- Whether to add a "title" attribute to the link prompt for nicer hover UX

## Things to check back on

- If Tiptap has a v3 release with breaking changes — pin to current major in package.json
- If `immediatelyRender: false` is needed in your Next.js setup or not (it depends on whether the editor is inside a Server Component boundary; in a modal triggered by user action, often not needed)
- If `@tailwindcss/typography` plugin install conflicts with Tailwind v4 — Tailwind v4 may have a different plugin syntax; adapt as needed
- If the existing settings page uses a server action for save — auto-save likely means switching to a fetch call; verify Auth.js session cookies are sent automatically

---

## End of spec

Start with Section 1. Commit per section. Update ERROR_REPORT.md at the end. Push to origin/main.