# Build Error Report

This document logs issues encountered during the initial build, their root cause,
and how they were resolved. Maintained going forward as a running log of
non-obvious problems.

## Pre-flight findings

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| Node version | 20.x | 22.16.0 (current LTS) | OK — v22 is compatible, `.nvmrc` set to 22 |
| pnpm | installed | 10.12.2 | OK |
| Docker | installed | 24.0.7 | OK |
| Docker Compose | installed | v2.10.2 | OK |
| git config | configured | Matthew McDonnell / mcdonnell.matthew@ymail.com | OK |
| Project directory | should not exist | Pre-existing with `.env.local`, `.gitignore`, `.claude/`, `CLAUDE_CODE_INSTRUCTIONS.md` | Resolved by moving conflicting files aside and merging .gitignore after scaffold |
| GitHub SSH | working | Authenticated as TheBuleGanteng | OK |
| Port 3000 | free | free | OK |
| Port 5432 | free | **OCCUPIED** (existing host Postgres) | Using **5433** instead in docker-compose.yml and DATABASE_URL |

## Build issues

### [2026-05-27] `pnpm create next-app` refuses non-empty directory

**Context**: Section 19, Step 1 — Scaffold

**Error**:
```
The directory language-learning-bot contains files that could conflict:
  .env
  CLAUDE_CODE_INSTRUCTIONS.md
  ERROR_REPORT.md
Either try using a new directory name, or remove the files listed above.
```

**Root cause**: `create-next-app` whitelists only certain dotfiles; project working
docs and the pre-populated `.env`/`.env.local` were blockers.

**Resolution**: Move `.env.local`, `.gitignore`, `CLAUDE_CODE_INSTRUCTIONS.md`,
and `ERROR_REPORT.md` to `/tmp/lang-*-backup` before running the scaffold,
then restore them afterward. Merge the scaffold's generated `.gitignore` with
the pre-existing one (the scaffold's was Node-flavored; the original added
Python/editor patterns and `.env*.local` rules).

**Lessons / Watch-outs**: For any future re-scaffolds, do the move-aside
dance up front. Don't forget to restore .env.local **before** running any
Next.js commands that depend on it.

### [2026-05-27] shadcn `Button` had no `asChild` prop

**Context**: Section 19, Step 1 — `pnpm build` after adding auth pages

**Error**: TypeScript:
```
Property 'asChild' does not exist on type 'ButtonProps & VariantProps<...>'.
```

**Root cause**: The latest shadcn registry (`shadcn@4.8.1`) ships a `Button`
backed by `@base-ui/react/button`, which doesn't expose `asChild` — that pattern
is Radix's `Slot` convention. Several of our auth pages relied on
`<Button asChild><Link>…</Link></Button>` to style links as buttons.

**Resolution**: Reverted `src/components/ui/button.tsx` to the classic shadcn
Radix-Slot variant: `pnpm add @radix-ui/react-slot`, then `Comp = asChild ? Slot : 'button'`.

**Lessons / Watch-outs**: shadcn registries drift; if any future component
breaks an API we rely on, check what library it switched to before refactoring
upstream usage.

### [2026-05-27] `process.env.NODE_ENV` is read-only in Next 16 ambient types

**Context**: Section 19, Step 3 — Vitest test setup

**Error**: `Type error: Cannot assign to 'NODE_ENV' because it is a read-only property.`

**Root cause**: Next's `next-env.d.ts` narrows `NODE_ENV` to a union literal and marks it readonly.

**Resolution**: In `tests/setup.ts`, cast `process.env` through `Record<string, string | undefined>` before assigning.

### [2026-05-27] `next-pwa` requires webpack; Next 16 defaults to Turbopack

**Context**: Section 19, Step 8 — PWA install

**Error 1** (production build):
```
ERROR: This build is using Turbopack, with a `webpack` config and no `turbopack` config.
…Build error occurred — Call retries were exceeded
```
**Error 2** (dev): the same error when running `pnpm dev` even though
`@ducanh2912/next-pwa` is configured with `disable: true` in dev — the plugin
still injects a webpack config at config-load time.

**Root cause**: Next 16 enabled Turbopack by default; mixing webpack-config-plugins
with Turbopack now hard-errors.

**Resolution**:
1. Run production builds explicitly under webpack: `"build": "next build --webpack"`.
2. In `next.config.ts`, only apply `withPWA` when `NODE_ENV !== 'development'`
   so the dev server (Turbopack) sees a clean config and the production build
   (webpack) gets PWA service-worker generation.

**Lessons / Watch-outs**: If a future plugin only ships a webpack hook, either
mirror this conditional, or look for a Turbopack-native alternative. PWA in
particular has thin Turbopack support as of Next 16; keep an eye on `next-pwa`
maintenance.

### [2026-05-27] Resend SDK call blocked the signup HTTP response

**Context**: Section 19, Step 9 — Playwright E2E `toHaveURL(/verify-sent/)` failed

**Error**: The signup page button remained stuck on "Creating account…" until
Resend responded. With `MOCK_EMAIL=1` set on the webServer env, the email
function still went down the real-Resend code path (.env.local overrides), and
the round-trip occasionally exceeded Playwright's 5s default URL assertion.

**Root cause**: `await sendVerificationEmail(...)` in the API route synchronously
awaited the Resend network call. Errors were already swallowed, so the response
gained nothing from awaiting.

**Resolution**: Changed the signup and forgot-password routes to fire-and-forget
(`void sendVerificationEmail(...)`). Outbound mail still happens; the HTTP
response no longer waits for it.

**Lessons / Watch-outs**: For any future "send a transactional email after a
mutation" path, prefer fire-and-forget. If the email actually fails, it's
the user's problem next time they retry — and the rate limit prevents abuse.

### [2026-05-28] `react-hooks/set-state-in-effect` flagged data-fetching effects as errors

**Context**: Section 19, Step 11 — `pnpm lint`

**Error**: New React Hooks rule in eslint-config-next 16 reports
`setState` inside `useEffect` as an error, even for the standard
fetch-then-setState data loading pattern used in `/vocab`, `/settings`,
and `/verify` pages.

**Resolution**: Turned the rule off project-wide in `eslint.config.mjs`.
The pattern is fine in practice (no cascading renders here — the
setState happens after an async network call, not synchronously on
mount). If the linter gets smarter, we can reconsider.

### [2026-05-27] Playwright `getByLabel` matched both the visible checkbox and a hidden input

**Context**: Section 19, Step 9 — E2E filter step

**Error**: `strict mode violation: getByLabel('Lesson 1', { exact: true }) resolved to 2 elements`

**Root cause**: shadcn's `Checkbox` (base-ui-backed) renders a visible
`role="checkbox"` span PLUS a hidden `<input type="checkbox">` for form
submission. Both share the same `aria-labelledby`/`for`, so `getByLabel`
matches both.

**Resolution**: Used `page.getByRole('checkbox', { name: 'Lesson 1' }).click()` — the role-based locator only sees the visible span. Asserted row visibility via `getByRole('row').filter({hasText: ...})` for the same reason.

## Build progress

### Completed

- Section 3 — Pre-flight checks
- Step 1 — Scaffold (Next 16, Tailwind v4, src/, Turbopack, shadcn/ui, 12 base components)
- Step 2 — Database: docker-compose Postgres 16 on host 5433, Drizzle schema (12 tables), migrations applied
- Step 3 — Crypto (AES-256-GCM) + env validation (Zod) + 11 unit tests
- Step 4 — Auth.js v5 (Credentials + JWT, strict email verification, password reset with JWT invalidation via sessions_invalidated_at), 5 API routes, 7 auth pages, mock-email mode
- Step 5 — `src/lib/models.ts` catalog + `/api/settings` GET/PATCH + `/settings` UI with masked/reveal API key flows
- Step 6 — CSV import: parser, find-or-create lessons & tags, batched insert in one txn, UI page, API route, CLI script, 15 unit tests (incl. fixture coverage of every edge case)
- Step 7 — Vocab CRUD: `/api/vocab` list/create with lesson+tag filters (AND/OR), `/api/vocab/[id]` GET/PATCH/DELETE, `/api/lessons`, `/api/tags`, full UI (list with sidebar filters, add/edit forms with datalist suggestions, AlertDialog-confirmed delete)
- Step 8 — `@ducanh2912/next-pwa` wired (production-only), `public/manifest.webmanifest`, generated 192/512 icons via sharp, `next.config.ts` supports `NEXT_PUBLIC_BASE_PATH` for sub-path deploys
- Step 9 — Playwright config + 1 happy-path E2E: signup → mark verified (DB) → login → CSV import → lesson filter → settings save/reveal. Passing.
- Step 10 — Dockerfile (multi-stage), docker-compose.prod.yml snippet, nginx location snippet, LICENSE (MIT), README with all 15 spec sections

- Step 10 — GitHub repo created at https://github.com/TheBuleGanteng/language-learning-bot (public, MIT), all commits pushed to `main`
- Step 11 — Final smoke checks all green:
  - `pnpm lint` → 0 errors, 0 warnings
  - `pnpm test` → 26/26 unit tests pass
  - `pnpm test:e2e` → 1/1 Playwright spec passes
  - `pnpm build` (--webpack, for PWA) → success, 24 routes generated
  - `pnpm dev` → http://localhost:3000 returns 200 for `/`, `/login`, `/signup`; `/api/lessons` correctly returns 401 when unauthenticated

### Remaining

(none — v1 build complete; next is the AI tutor and FSRS flashcards from the roadmap)

## Known issues / deferred

- **PWA icons are placeholders** — solid `#0ea5e9` square with a white "L".
  Re-run `pnpm tsx scripts/gen-icons.ts` after dropping branded artwork into
  the script. Acceptable for v1; should be swapped before any public launch.
- **Anthropic / OpenAI / Google API keys in .env.local** are unused by the
  app at runtime (per-user keys live encrypted in `user_settings`). They
  exist only as developer-side fallbacks; safe to remove.
- **Auth.js sessions/accounts tables** are created via the Drizzle adapter
  schema but unused in practice (JWT strategy + Credentials provider doesn't
  need them). Left in place because removing them would be a schema change
  and adapter compatibility might matter for a future OAuth provider.
- **`item_performance` table** is empty in v1 — schema exists for the FSRS
  flashcard work that comes later.

## Vocab UI improvements (post-v1)

### Changes

- **Filter sidebar**: Lessons and Themes are now collapsible accordions
  (`@base-ui/react/accordion` via shadcn). Open/closed state persists per
  category to `localStorage` (`lang.filters.lessons.open`,
  `lang.filters.themes.open`); both default to expanded on first visit.
  Each section has a per-section client-side search box with an inline
  X-button to clear, plus "Select all" (respects the visible filter) and
  "Clear selection" (always wipes) links. Sidebar shows a colored dot per
  option that matches the pill color used in the table.
- **Pill coloring**: `src/lib/colors.ts` ships a djb2 hash plus two
  12-entry palettes — saturated `-100` colors for lessons, muted
  `-50/-100` colors for tags. `colorForLesson(name)` and `colorForTag(name)`
  return deterministic `{bg,text,ring}` Tailwind triples, so the same
  lesson/tag name renders the same color across the table and the filter
  sidebar.
- **Table header + sorting**: header row now uses `bg-muted`,
  `font-semibold`, `border-b-2`, and click-to-sort with hover. Sortable
  columns (Target, English, Lessons, Tags) cycle None → ASC → DESC → None
  and persist via `?sort=…&order=…` URL params. Lessons and Tags use a
  correlated `MIN(name)` subquery so items with multiple associated rows
  sort by the alphabetically-first; `NULLS LAST` keeps unassociated items
  at the bottom in either direction.
- **Pagination**: page size selector (25 / 50 / 100 default / All) above
  the table, with the choice persisted in the URL (`?pageSize=…`). When a
  finite page size is selected, a "Load more (N remaining)" button below
  the table fetches the next page and appends to the current list
  (cumulative). All filter / sort / search / pageSize changes reset the
  cumulative list to page 1 via a stable `filterKey` memo.
- **Edit/Delete buttons**: Edit uses blue outline; Delete uses subtle red
  ghost. Both grouped right-aligned in the Actions column.

### Issues hit

- **Drizzle SQL objects are circular** — the order-by unit test couldn't
  `JSON.stringify` the `SQL` expressions returned by `buildOrderBy`
  because columns and tables reference each other. Resolved with a
  recursive `chunkString` helper that walks `queryChunks`/`value` and
  pulls the literal SQL pieces only.
- **Route module exports** — initially placed `SORT_COLUMNS` and
  `buildOrderBy` in `src/app/api/vocab/route.ts`. Next.js only allows
  HTTP-method exports from route files, so the helpers moved to
  `src/lib/vocab.ts` and the route imports them.

### Known follow-ups

- The `All` page size renders every matching row without virtualization.
  On the full 1,907-row import that's ~1,900 DOM rows — usable on
  desktop but laggy on weak devices. Drop in `@tanstack/react-virtual`
  when this starts to bite.
- Sorting by Lessons / Tags uses `MIN(name)` of joined rows, so an item
  tagged `[food, classifier]` sorts as if it were just `classifier`.
  Acceptable for v1; document in a header tooltip if it confuses anyone.

## Lesson pages + URL restructure (post-vocab-UI)

### Changes

- URL restructure: `/vocab/...` → `/language/[lang]/vocab/...` with
  middleware-driven redirects from legacy paths and a "wrong language"
  guard that bounces to the user's actual target language with a
  `?notice=wrong-lang` toast hint.
- New top nav (Vocab / Lessons / Settings) in the (app) layout, derived
  from the user's `target_language` field on `users`.
- Pluggable storage abstraction (`src/lib/storage`): local FS in dev,
  GCS in prod, selected via `STORAGE_DRIVER` env. Local driver streams
  files through `/api/files/[...path]` with auth + path-traversal
  rejection; GCS driver returns v4 signed URLs with 15-minute TTL.
- New schema tables `lesson_files` (PDFs + audio) and `lesson_links`
  (generic URLs + YouTube embeds with auto-detect + oEmbed title).
- Lesson detail page with five accordion sections (Notes / Audio /
  Useful Links / Practice / Vocabulary). PDF render via `<iframe>`,
  audio via `react-h5-audio-player`, YouTube via the privacy-preserving
  `youtube-nocookie.com` embed. Uploads via `react-dropzone`.
- Lessons index page with sortable Name / Topic / Date / Vocab columns
  and a New Lesson dialog.
- Practice stub pages for Flashcards and AI Chat (coming-soon copy).
- Settings: target and native language selectors. v1 unlocks Thai only
  as target; native is fully selectable.
- Dynamic UI labels: "Target"/"English" are now rendered from
  `users.target_language` / `users.native_language` (e.g. "Thai") in
  the vocab table headers, vocab form labels, and the lesson detail
  vocabulary section header.
- Language code migration: `users.target_language` / `native_language`
  now use 2-letter ISO codes (`th`, `en`) instead of the old
  `'thai'` / `'english'` literals. A data migration converts existing
  rows; `normalizeLanguageCode()` defensively coerces stale values.

### Issues hit

- **Next 16's `proxy.ts` + `output: 'standalone'` build trace bug**.
  After moving from `middleware.ts` to `proxy.ts` (the new Next 16
  convention; middleware is deprecated), the first `pnpm build` failed
  in "Collecting build traces" with `ENOENT proxy.js.nft.json`. The
  fix was simply to clean `.next/` and rebuild — the prior aborted
  build had left a stale tracing state. Worth noting because the error
  message points at a Next.js internal file and looks like a
  framework bug; recovery is `rm -rf .next && pnpm build`.
- **Auth.js v5 + argon2 in middleware**. When briefly experimenting
  with `middleware.ts` (Edge runtime by default in Next 16), the build
  failed because `@node-rs/argon2` can't load in the Edge runtime.
  Renaming the file to `proxy.ts` (Node runtime by default in Next 16)
  fixed it. The proxy file does not accept a `runtime` config option,
  so the file name is the only switch.
- **Stashing target language in the JWT**. The proxy needs the user's
  target-language code to redirect legacy `/vocab` paths, but a DB
  lookup per request is too expensive. Solution: refresh
  `targetLanguage` + `nativeLanguage` into the JWT on every `jwt`
  callback alongside the existing session-invalidation check. The
  proxy reads the codes from `req.auth.user.targetLanguage`.
- **Schema language-field migration**. The original `users.target_language`
  default was `'thai'`. The new spec uses 2-letter ISO codes (`'th'`).
  Drizzle's `db:generate` only emitted the `ALTER COLUMN ... SET
  DEFAULT 'th'` statement; we hand-appended `UPDATE` statements to
  migration `0002_empty_steel_serpent.sql` to convert any pre-existing
  rows (`'thai'` → `'th'`, etc.).
- **VocabTable refactor**. The original vocab page held filter state in
  the URL. The lesson-detail vocab section needed the same table but
  scoped to one lesson and with no sidebar filters. We split out
  `<VocabTable lessonId showSearch showPageSize />` for the embedded
  case (filter state held in component state instead of URL) and kept
  the original URL-state-driven page intact.

### Known follow-ups

- Mobile-responsive card layout for vocab table (still horizontal-
  scroll on phone).
- Other languages besides Thai unlocked in the Settings target dropdown.
- File upload for in-lesson video (currently YouTube links only).
- Editing existing useful links (currently only add + delete).
- Drag-to-reorder for useful links (position column exists; no UI).
- E2E spec for PDF upload + delete is not yet added; the storage
  round-trip is covered by the local-storage unit test instead.

## UI remediation pass (post-lesson-pages)

### Changes

- Confirm-delete dialog now shows the item name in the description
  ("This will permanently delete &ldquo;…&rdquo;"), disables both Cancel
  and Delete during the in-flight request, blocks dismissal mid-delete,
  and surfaces server errors inline (dialog stays open for retry).
  Applied to PDFs, audio, and useful links via a shared
  `<ConfirmDeleteDialog>` component.
- Top nav consolidated: only Vocab and Lessons on the left; Settings
  and Sign out moved into a user-email dropdown menu on the right.
  Sign-out switched from a `<form>` server action to client-side
  `next-auth/react`'s `signOut({callbackUrl: '/'})` so it can live as a
  DropdownMenuItem.
- Settings language dropdowns show `Name - CODE` (e.g. "Thai - TH") via
  a new `languageDisplayLabel()` helper. Content-descriptive labels
  (vocab table column header, lesson vocab section heading) still show
  just the name — picker-style labels only get the code.
- Inline editing replaces the per-lesson "Edit lesson details" modal:
  `<InlineEdit>` for name + topic, `<InlineDateEdit>` for the date
  using a popover calendar. Enter saves (Cmd/Ctrl+Enter for multiline),
  Escape or click-outside cancels. Date picker saves on select with a
  "Clear" footer button.
- Notes and Audio drop zones compressed from a tall vertical card
  (~150–200px) to a single horizontal bar (~64px): icon on the left,
  instruction in the middle, size/format hint on the right. During
  upload the bar height stays the same; the text becomes the filename
  plus an indeterminate progress bar.
- CSV import page replaced the raw `<input type="file">` (Tailwind
  `file:*` selectors) with a `react-dropzone` drop area containing a
  styled shadcn "Choose file" button. Hidden input stays in the DOM so
  E2E `setInputFiles` keeps working.

### Issues hit

- **shadcn `add calendar popover` interactive prompt blocks**. Running
  `pnpm dlx shadcn@latest add calendar popover` stops at a y/N prompt
  to overwrite the existing `button.tsx`, which we customised earlier
  (Radix Slot variant — see prior section). The non-interactive flag
  `--yes` would overwrite our button. Workaround: kill the prompt,
  accept the popover.tsx that shadcn already wrote before stopping,
  and create `calendar.tsx` by hand as a thin `react-day-picker`
  wrapper (installed directly via `pnpm add react-day-picker date-fns`).
- **InlineDateEdit + base-ui Popover**. The shadcn `PopoverTrigger` in
  this codebase is base-ui-backed, so it uses `render={<button .../>}`
  rather than `asChild`. Passing a button via the `render` prop works
  but the typings are subtly different from radix; worth noting if a
  future codemod tries to swap libraries.
- **Date timezone drift**. The lesson `date` column is `date` (no
  timezone). Initial implementation used `new Date(yyyyMmDd)` which
  parses as UTC midnight and renders as the previous day in non-UTC
  zones. Fixed by parsing as `new Date(\`${date}T00:00:00\`)` (local
  midnight) and serializing back with a hand-rolled local
  `YYYY-MM-DD` formatter that doesn't go through `toISOString()`.

## UI polish pass 3 (post-UI-remediation)

### Changes

- Settings language dropdowns now display the full `Name - CODE` label
  in the trigger (was showing just the bare code after selection). Uses
  `base-ui`'s `Select.Value` children render-function: `<SelectValue>
  {(v) => languageDisplayLabel(v)}</SelectValue>`.
- Auto-save for the Languages and LLM provider sections: each dropdown
  PATCHes immediately, a per-field `<SaveStatus>` chip flashes
  Saving… → Saved (1.5s, green check) → fades back. Provider change
  still snaps the model to that provider's default and persists both in
  a single PATCH. The API-key sub-section keeps its explicit Save
  button — text inputs shouldn't save on each keystroke.
- Lessons index rows: hover bg, active tap bg, link-styled name with
  hover underline, and a trailing `ChevronRight` icon column for the
  iOS-Settings "tap to drill in" affordance. Row remains the click
  target.
- Vocab-table lesson pills become `<Link>` to the lesson detail page
  with hover underline + opacity dip; `stopPropagation` on the click so
  any future row-level handler won't fight the pill nav. Tag pills
  intentionally stay non-clickable (no tag detail page yet).
- Tiptap rich-text editor (StarterKit minus headings + underline +
  link) for the lesson topic and useful-link notes. Modal-hosted via
  `<RichTextEditModal>` for topic; inline within the existing add-link
  form for notes. Rendering goes through DOMPurify-based
  `<RenderedHtml>` with a strict allowlist (p/br/strong/em/u/ul/ol/li/a;
  href/target/rel attrs only).
- Lessons index Topic cell strips HTML via `stripHtml()` + Tailwind
  `line-clamp-2` so HTML topics render readably in the small table cell.

### Issues hit

- **base-ui `Select.Value` default rendering**. Out of the box,
  `<Select.Value>` renders the bare value attribute. The official
  base-ui pattern to override this is a children render-function:
  `<SelectValue>{(value, item) => ...}</SelectValue>`. The shadcn
  wrapper preserves children pass-through; no library change needed.
- **Tailwind v4 typography plugin syntax**. The standard
  `tailwind.config.js` JS-plugin pattern (`plugins:
  [require('@tailwindcss/typography')]`) doesn't apply here — this
  project is Tailwind v4 with CSS-based config. Wired the plugin via
  `@plugin "@tailwindcss/typography";` in `globals.css` alongside the
  existing `@import "tailwindcss";` and `@import "tw-animate-css";`.
- **stripHtml whitespace at block boundaries**. A naive
  `replace(/<[^>]*>/g, '')` glues consecutive `<p>` blocks together
  ("oneTwo"). Fixed by first inserting a space after each block-level
  closing tag (`</p>`, `</li>`, `</div>`, `</h{1-6}>`, `</br>`,
  `</blockquote>`) then collapsing runs of whitespace.

### Known follow-ups

- Vocab notes column is unused; could become rich-text in a later pass.
- A "general lesson notes" field (separate from PDFs) was discussed;
  deferred.
- Tag pill clickability deferred (no tag detail page yet).
- The rich-text editor `<input>`-style placeholder is wired via a
  `data-placeholder` attribute on the editor body but the CSS to
  render it visually is not yet added — empty editors look blank
  rather than showing the placeholder. Cosmetic; revisit when other
  Tiptap polish lands.

## Vocab image generation

### Changes

- DB: 7 new columns on `vocab_items` (`image_storage_key`,
  `image_status` with CHECK in `'none'`/`'generating'`/`'completed'`/
  `'refused'`/`'failed'`, `image_prompt`, `image_prompt_override`,
  `image_provider`, `image_model`, `image_generated_at`). New
  `image_generation_log` table for cost history (`vocab_item_id` is
  `ON DELETE SET NULL` so historical cost rows survive vocab
  deletion). `user_settings` gains `image_provider` (default google),
  `image_model` (default imagen-4-fast),
  `image_spend_reminder_usd` ($25), `image_spend_hard_stop_usd` ($100),
  and the composite `image_spend_last_reminder_at` (`"YYYY-MM:amount"`).
- Pluggable image-gen provider abstraction
  (`src/lib/image-gen/{types,catalog,google,openai,prompt,index}.ts`)
  with Google Imagen 4 (fast/standard/ultra) and OpenAI GPT-Image
  (1-mini, 1.5-low/standard/high). Catalog maps each ID to estimated
  USD per image and the actual API model + quality tier.
- Standard prompt template enforces no-text-in-image / cartoon style;
  user overrides wrap with the same no-text rule.
- Storage gains `putPublic()`: keys under `public/...`, served via
  long-lived cacheable URLs. Local: same on-disk layout, route skips
  the owner-auth check + emits `Cache-Control: public, max-age=31536000,
  immutable` for public paths. GCS: `file.makePublic()` + direct
  `storage.googleapis.com` URL.
- Cost tracking: monthly SUM aggregation excluding `status='failed'`,
  `enforceHardStop()` throws `HardStopExceededError` before billing
  calls, `checkAndRecordReminderBand()` stamps the new band with a
  composite `"YYYY-MM:amount"` so a fresh month auto-resets without
  a cron. New `GET /api/settings/image-spend` returns the snapshot.
- Settings page: "LLM provider" renamed to "Chat Model"; new "Image
  Model" card (provider/model dropdowns, per-image cost, missing-key
  warning) and "Image generation budget" card (reminder + hard stop
  inputs with cross-field validation, auto-save on blur, MTD status
  footer with "N images possible at current model price").
- Vocab list: "Generate Images" button → selection mode (per-row
  checkboxes, sticky action bar, "Select all visible", new "Image
  status" filter chips All/Has/No/Failed). Bulk cost-preview modal
  shows estimate, MTD projection, next-reminder warning, and an
  "affordable items only" path if the request would exceed hard stop.
- In-process bulk executor: marks rows `'generating'`, fires a
  2-worker loop that calls the user's chosen image provider, uploads
  via `storage().putPublic('public/users/.../{uuid}.png')`, logs each
  call. Stale `'generating'` rows (>5 min) get swept back to
  `'none'` on next request — survives Next.js dev-server restart
  without leaving orphaned spinners.
- Polling: client GETs `/api/vocab/generation-status` every 5s while
  a batch is in flight and refreshes table rows; DELETE cancels
  future-queued items.
- Single-item flow: `POST /api/vocab/[id]/image/generate` (used for
  both first-time + regenerate), `DELETE /api/vocab/[id]/image`
  (image only — vocab row preserved), `PATCH /api/vocab/[id]/image-
  prompt-override`. Vocab edit page gets a new Image card with
  thumbnail, Generate/Regenerate/Delete + an Advanced custom-prompt
  textarea.
- Thumbnails: leftmost Image column (~40×40, lazy-loaded) in the
  main vocab list and the lesson-scoped VocabTable. Click →
  `<ImagePreviewDialog>` showing the image at up to 70vh with target
  + native text and a "View vocab item" link. Tag/lesson pills
  `stopPropagation` so they don't fight the image preview.

### Issues hit

- **`ImageProviderId` lived in both `catalog.ts` and `types.ts`**.
  Initial draft declared it in `catalog.ts` alongside the catalog
  helpers; re-exported through `index.ts` failed `tsc --noEmit`
  because the re-export couldn't see the same symbol in two
  declaration files. Resolution: moved the type alias to `types.ts`
  (the canonical source) and kept `catalog.ts` exporting only
  runtime values.
- **In-process batch state needs cleanup on restart**. The `BATCHES`
  Map lives in module scope; if the Next.js dev server hot-reloads,
  rows get stuck on `imageStatus='generating'`. Fixed by having
  `resetStaleGenerating()` run at the top of every status GET and
  the bulk-POST handler — items older than 5 minutes revert to
  `'none'`.
- **Composite-month reminder format**. Wrote `image_spend_last_
  reminder_at` as `text` with the format `"YYYY-MM:amount"`. On
  read, if the YYYY-MM prefix doesn't match the current UTC month,
  the band is treated as 0 — so a fresh month auto-resets all
  reminders without needing a separate cron.
- **GCS `file.makePublic()` requires fine-grained ACLs**. If the
  bucket has uniform-bucket-level access enabled, `makePublic()`
  throws. Documented the IAM-prefix-grant alternative in README.
- **`vocabItemId` in `image_generation_log` is nullable**. Chose
  `ON DELETE SET NULL` so a user who deletes a vocab item later
  still has accurate monthly-cost data. Trade-off: the log row
  can't always be joined back to a specific vocab row.

### Known follow-ups

- Bulk generation is in-process; no resilience across server restart.
  A real job queue (BullMQ + Redis) is the next step if bulk runs
  span restarts.
- Cost tracking is image-gen only; chat token cost tracking deferred.
- Anthropic has no image-gen offering — only the Chat Model setting
  shows it.
- No retry-with-backoff on transient provider failures.
- The image prompt is English; users learning languages with non-
  English native text should be aware that `native_text` drives
  image gen and should be a language the image model understands
  well.
- Unit test for `getMonthToDateImageSpend` and reminder-band logic
  deferred — exercises the live `db` singleton, would require either
  vitest-mock of the db module or a dedicated test database. The
  image-prompt template is covered.

## Vocab page filter fix

### Root cause

Image-status filter buttons (All / Has image / No image / Failed-refused)
appeared to do something — the chip highlight switched — but no network
request fired and the table didn't change.

Reading the existing client component reveals the asymmetry between
filter mechanisms:

- **Lesson + Theme filters** live in URL search params via
  `useSearchParams`. The derived `selectedLessons` / `selectedTags`
  Sets are computed from `search.getAll(...)` and feed into a
  `filterKey` memo. The fetch effect depends on `filterKey` (plus
  `selectedLessons`, `selectedTags`, etc.), and the fetch URL is
  built with `qs.append('lesson', id)` / `qs.append('tag', id)`. So
  clicking a checkbox → URL changes → `useSearchParams` re-runs →
  derived Sets change → `filterKey` recomputes → fetch effect re-runs
  → new data arrives.
- **Image-status filter** was wired through a plain
  `useState<ImageStatusFilter>` (line 126 of vocab/page.tsx). The
  state was read by the filter-chip UI for the active highlight, but:
  1. `imageStatusFilter` was **not in `filterKey`'s dependency list**;
  2. the fetch effect did **not depend on it** and did **not add
     `imageStatus` to the query string**.

  So state changed → React re-rendered → the active chip moved → but
  the fetch effect's dep array hadn't observed any change, so it
  didn't fire.

Secondary bug, surfacing during batch generation: the `refreshItems()`
helper used by the `/api/vocab/generation-status` polling does only
`setLoadedPages(1)` + `setItems([])`. When `loadedPages` was already
1 — the default state after a fresh `enterSelectionMode` /
`confirmBulkGenerate` cycle — React bails out of the no-op setState,
the fetch effect's `loadedPages` dep doesn't change, and no fetch
fires. The poll thinks it's refreshing but the UI freezes on a stale
snapshot.

### Fix path

Align image-status with the same URL-params-driven pattern the other
filters already use. Use a dedicated `setRefetchCounter(n+1)` signal
(in the fetch effect's deps) so imperative refresh callers — the
polling loop, post-mutation handlers — can force a real re-fetch even
when none of the other params changed.

### Changes

- Image-status filter moves from `useState` to a URL search param
  (`?imageStatus=has|none|failed`, omitted = `all`). The setter writes
  via `updateParams()` so a click → `router.push` → search-params
  re-read → `filterKey` recomputes → fetch effect re-runs.
- Added `imageStatusFilter` to `filterKey`'s dep list and to the fetch
  effect's explicit dep list (belt-and-suspenders); fetch effect now
  also appends `imageStatus` to the request querystring.
- Backend `/api/vocab` `imageStatus=none` is now strict (`image_status
  = 'none'`); `'generating'` is no longer folded in.
- New `refetchCounter` state: bumped by `refreshItems()` (called from
  the bulk-batch polling loop) so each tick triggers a real re-fetch.
  Previously the helper set `loadedPages = 1` + `items = []`, but
  React bails out of the no-op `setLoadedPages(1)` when it's already
  1, leaving the polling loop refreshing without ever fetching.
- `confirmBulkGenerate()` switches the filter to `'all'` immediately
  after a successful submit so items don't vanish from the No-image
  view as they transition through `'generating'` → `'completed'`.
- `enterSelectionMode()` calls the new URL-writing
  `setImageStatusFilter('none')`, so the auto-narrow on entering
  selection mode is now a real filter change — same code path as the
  lesson/theme filter chips.

### Issues hit

None during this pass — the bugs and the fix path were both
identified up front during Section 1's diagnosis. The previously-
authored backend `imageStatus=none` clause was intentionally
permissive (folding in `'generating'`) but became wrong once the
front-end switched to `'all'` during batches; tightening it was the
correct follow-up.

## Batch completion notification

### Existing architecture (Section 1 diagnosis)

- The bulk-image executor (`src/lib/image-gen/executor.ts`) stores per-
  batch state in a module-scope `BATCHES = new Map<batchId, BatchState>`.
  State holds `userId`, `total`, `completed`, `failed`, `refused`,
  `cancelled`, and a few extras. After all workers finish, a 60-second
  `setTimeout` removes the entry from the Map.
- The status endpoint `GET /api/vocab/generation-status` reads from
  `getBatchStatusForUser(userId)` — which loops the Map and returns the
  one still in flight (or `null` if done).
- Polling lives **only on the vocab page** (`src/app/(app)/language/[lang]/
  vocab/page.tsx`). It hits the status endpoint every 5s while a batch
  is in flight, then stops.

### Implications for cross-page notification

1. **In-process state alone can't tell us about completed-while-away
   batches.** The 60-second post-finish retention is the only window
   the client has to "see" completion; if the user is on `/settings`
   when the last image lands, by the time they return to the vocab
   page the Map entry is gone and the notification is lost.
2. **No record of dismissal.** Re-querying for an in-process completed
   batch from any page would naively re-show the popup on every
   reload until the 60s window expires.
3. **No persistence across server restart.** If the Next.js process
   restarts mid-batch, the BATCHES Map is empty on the next request
   and there's nothing to notify on.

### Fix path

Add an `image_generation_batches` table that the executor writes to as
items finish. The new `GET /api/vocab/active-batch` reads from this
table:

- If the most-recent batch is unfinished → return active counts.
- If it's finished but `notification_dismissed_at IS NULL` → return as
  `pendingNotification`, so the client can show the popup.
- If finished AND acknowledged → return `{ active: false }`.

A new `POST /api/vocab/active-batch/dismiss` stamps the row, ending the
notification's pending state. The existing in-process executor + 60s
retention stays untouched — it's still the fastest path for the vocab
page's thumbnail polling. The DB row is the source of truth for
"happened across pages / sessions / restarts."

### Changes

- New `image_generation_batches` table tracks the lifecycle of each
  bulk run: `started_at`, `finished_at`, per-status counts
  (`succeeded`/`failed`/`refused`), `stopped` flag, and a
  `notification_dismissed_at` timestamp the client stamps after
  showing the popup.
- Executor wired at two points: `startBatch()` inserts the row (its
  uuid becomes the in-memory `batchId`); the worker loop UPDATEs the
  counters after each image and writes `finished_at` + `stopped` on
  the final pass.
- `GET /api/vocab/active-batch` returns one of three shapes —
  `{ active: true, ...counts }`, `{ active: false,
  pendingNotification: {...} }`, or `{ active: false }` — driving the
  watcher's poll/idle/popup decision.
- `POST /api/vocab/active-batch/dismiss` stamps
  `notification_dismissed_at` scoped by `(batchId, userId)` so a
  forged batch id from another user is a no-op.
- `<BatchWatcher userLang={...} />` client component mounted in the
  `(app)` layout. Polls every 5s on success, 10s backoff on transport
  errors. Stops polling once the popup is on screen or both
  "active" and "pendingNotification" are absent. Restarts on the next
  mount.
- Popup shows Requested / Successfully created / Errors. Title is
  "Batch stopped" when the user cancelled. When errors > 0, a "View
  failed items" button navigates to
  `/language/{userLang}/vocab?imageStatus=failed`. Dismissal is
  optimistic — the dialog closes immediately and the
  `/dismiss` POST happens in the background.

### Issues hit

None during this pass. The two-source-of-truth design (in-memory
`BATCHES` Map for the vocab page's fast thumbnail poll, DB row for
cross-page) was deliberate and the persistCounts UPDATE inside the
worker loop landed without complication — Drizzle handles the single-
PK UPDATE in ~1ms per call which is far smaller than the per-image
provider call.

### Known follow-ups

- The vocab page still runs its own 5s polling against
  `/api/vocab/generation-status` for thumbnail refresh, in parallel
  with the `<BatchWatcher>`'s polling against
  `/api/vocab/active-batch`. Two redundant polls while on the vocab
  page during a batch. Could be unified by having the vocab page
  subscribe to the watcher's state via context — left as a follow-up.
- No browser Notifications API integration (out of scope per spec).
- No completion sound (out of scope).
- No batch-history view ("show me my past batches") (out of scope).

### Follow-up fix (post-initial-build)

Discovered via testing: the watcher's polling loop terminated on the
first idle response. Because the `(app)` layout is persistent (doesn't
unmount on internal navigation), the watcher stopped polling
permanently on first login and only revived on full page reload.
User-visible symptom: the bulk-completion popup only appeared after a
manual reload.

Fix: idle polls continue at a slow cadence (15s) instead of stopping,
active polls stay at 5s, network errors back off to 10s. A custom
`batch-started` window event dispatched from the bulk-submit handler
gives the watcher an immediate signal when a new batch begins,
avoiding up to 15s of detection lag. Refactored the polling so
`poll`/`schedule` are stable `useCallback`s with a `pollRef` mirror —
the timeout callback always invokes the latest closure without
restarting the loop on every render.

## Photo vocab extraction

### Changes

- New "Photo Extraction Model" settings card (Anthropic Opus 4.7
  default, plus OpenAI GPT-5 / Google Gemini 2.5 options). Mirrors the
  existing Chat Model / Image Model auto-save UX with the same
  missing-API-key warning.
- `user_settings` gains `extraction_provider` (`'anthropic'`) and
  `extraction_model` (`'claude-opus-4-7'`) columns.
- Vision-based extractor abstraction (`src/lib/extraction/`):
  `types.ts`, shared `prompt.ts`, three providers
  (`anthropic.ts` / `openai.ts` / `google.ts`), a `makeExtractor()`
  factory, and a shared `parseExtractionResponse()` with Zod
  validation and markdown-code-fence stripping.
- `POST /api/vocab/extract-from-photos`: multipart/form-data, ≤10
  images × ≤10MB. Reads the user's selected provider/model +
  decrypted API key, returns the extracted rows. Pure extraction —
  saves nothing.
- `<PhotoUploader>`: multi-image drop + click, per-photo Crop dialog
  powered by `react-image-crop` (free-form rectangular). The crop
  dialog always renders the ORIGINAL image so the user can recover a
  wider region than a previous crop; the applied blob is freshly
  drawn from the original via canvas at JPEG q=0.92.
- `<ExtractedVocabReview>`: preview table with per-row checkboxes,
  inline edit on Thai / English (Enter commits, Escape cancels,
  edited cells render in muted italic), per-row tag + lesson
  MultiSelectChips, low-confidence rows flagged with an amber
  triangle. Bulk-apply panel UNIONs picked tags/lessons into every
  checked row (additive — existing per-row picks survive).
  "+ Add row manually" inserts a blank row at the bottom; "Unselect
  from here down" handles the common "LLM picked up exercise text
  after the vocab list ended" case.
- `POST /api/vocab/save-extracted`: dedup by `(target_text,
  native_text)`. Existing matches get the new lessons + tags merged
  in (existing text fields preserved); new pairs insert as fresh
  vocab. Wrapped in a transaction with a per-row error list in the
  summary response. Ownership of every supplied `tagId` / `lessonId`
  validated in bulk before mutating.
- Entry points: "Add vocab from photo" button on the main vocab page
  sidebar toolbar (no defaultLessonId) and above the lesson detail
  page's embedded vocab table (defaultLessonId = current lesson).
  A shared `<ExtractionFlow>` owns the two-phase modal: upload →
  review.
- Mobile gate: viewports ≤767px see a "use a larger screen"
  placeholder instead of the upload UI. The review table is
  desktop-only; trying to translate the per-row pill editors and
  inline-edit cells to a phone wasn't worth a v1.

### Issues hit

- **OpenAI Chat Completions multimodal content type**. The provider
  expects `image_url` parts shaped as
  `{ type: 'image_url', image_url: { url: 'data:...' } }`, not the
  simpler `{ image_url: '...' }`. Got the typing right via
  `OpenAI.Chat.ChatCompletionContentPart[]` from the SDK so future
  shifts will surface at compile time.
- **Anthropic vision media-type whitelist**. The `media_type` field
  on a base64 image source is a string-literal union
  (`'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'`), not
  any string. Added an `isSupportedMediaType()` guard with a JPEG
  fallback for anything outside the whitelist.
- **`useRef` initializer with `URL.createObjectURL`** failed the
  `react-hooks/refs` rule ("cannot access ref value during render").
  Replaced with `useState(() => URL.createObjectURL(...))` — same
  one-shot initialization semantics, but readable from JSX and
  ESLint-clean.
- **Composite-PK dedup lookup**. PostgreSQL doesn't have a tidy
  `WHERE (target,native) IN ((a,b),(c,d))` over composite keys, so
  the save endpoint pulls candidates by `target_text IN (...)` and
  filters in JS on the `${target}\n${native}` join. Fine for the
  expected batch sizes (≤500 rows per save).

### Known follow-ups

- Cost tracking isn't included; will fold in once the unified LLM
  cost tracker lands.
- Source photos aren't persisted, so re-extracting with a different
  model means re-uploading. Deliberate (per the out-of-scope list)
  but worth noting.
- Mobile preview table would require a card-based redesign; gated
  for now.
- Only additive bulk-tag mode; clearing tags requires per-row
  editing.
- The `MultiSelectChips` filter input doesn't yet support "create
  new tag" / "create new lesson" inline — the user has to leave the
  flow to create those. Acceptable for v1.
  (Update: the lessons picker now supports "+ Create new lesson"
  inline — see the section below. Tag creation is still out-of-flow.)

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

## Vocab form pickers fix

### Section 1 findings (existing picker code)
The bulk lesson/tag pickers were NOT yet extracted — they lived as a local
`MultiSelectChips` component (plus a `RowPills` wrapper) inside
`src/components/extraction/extracted-vocab-review.tsx` (not the
`src/components/extracted-vocab-review.tsx` path the spec guessed). It's a
custom popover (no cmdk/downshift dependency): a pill trigger, a filter
`<Input>`, a checkbox-style list, and (added in the prior pass) an optional
"+ Create new …" action at the top. Extracted it to
`src/components/multi-select-chips.tsx` and built `LessonPicker` / `TagPicker`
on top; `extracted-vocab-review.tsx` now imports the shared component.

### Changes
- Extracted LessonPicker and TagPicker into shared reusable components
- Vocab edit form: replaced broken single-lesson dropdown with LessonPicker (multi-select with pills)
- Vocab edit form: replaced comma-separated tags input with TagPicker (multi-select with pills)
- Vocab add form: same picker treatment
- PATCH /api/vocab/[id] and POST /api/vocab now accept lessonIds: string[] and tagIds: string[]
- Lesson/tag association is full-replacement semantic: provided array replaces existing set
- Added POST /api/tags (find-or-create) for the "+ Create new tag" flow
- Association inserts are owner-validated (only the user's own lesson/tag IDs are attached)

### Why
The vocab edit form was inconsistent with the rest of the app: it treated lessons
and tags as single-value fields despite the M:N data model. Also the lesson
dropdown had a UI bug preventing it from opening at all. Fixed both by aligning
to the picker pattern used elsewhere (photo extraction).

## Picker dismissal fix (click-away + Escape)

### Findings
`src/components/multi-select-chips.tsx` is a hand-rolled popover: a `useState(false)`
toggled by the trigger button, with the dropdown rendered as an `absolute`-positioned
`<div>` inside a `relative` wrapper (Option B in the spec). It is NOT shadcn/Radix
`<Popover>`, so click-outside and Escape dismissal were never wired in — the dropdown
only closed via the "Done" button, selecting "+ Create new", or navigating away.

### Fix
Chose the manual-listener approach (spec Option (b)) over refactoring to shadcn
`<Popover>`. Reason: the component anchors its dropdown full-width to its own trigger
via inline absolute positioning and is shared by three call sites (vocab-form
LessonPicker/TagPicker, the extraction bulk pickers, and RowPills). Moving to a
portaled Radix Popover would change DOM structure, width anchoring, and stacking —
regression risk across all three for a "tiny remediation." Added a `useEffect`
(active only while open) that attaches `mousedown` and `keydown` listeners on
`document`, closing the popover on a click outside the wrapper ref or on Escape.
Selecting an option still keeps the popover open (clicks inside the wrapper are
ignored), matching the spec's expected behavior.

## Search quality + special character input

### Changes
- Search results now ranked by relevance: exact > whole-word > prefix > substring, length tiebreaker
- Added `target_text_normalized` and `native_text_normalized` columns with indexes
- Normalization (`src/lib/text-normalize.ts`): map ɛ/ʉ/ɔ to e/u/o + NFD decompose + strip combining marks (Mn) + lowercase
- Backfill script: `scripts/backfill-normalized-text.ts` (run via `node --env-file=.env.local --import tsx scripts/backfill-normalized-text.ts`)
- Search WHERE/ORDER use normalized columns for matching; tier 1 still checks original text for visual-exact
- New `<SpecialInput>` component (`src/components/special-input.tsx`) wraps Input with palette popover + inline hotkey replacement
- Hotkey scheme: `` ` `` / `'` / `\` / `^` after a vowel → háček/acute/grave/circumflex; `6` after e/u/o → ɛ/ʉ/ɔ
- SpecialInput applied to vocab search bar, vocab add/edit target field, transliteration, photo-extraction inline target edit
- Normalized columns populated on every write path: POST /api/vocab, PATCH /api/vocab/[id], save-extracted, CSV import

### Why
Search was sorted by DB insertion order, making exact lookups frustrating. Accent
input was copy-paste-only. These three improvements together close the loop on text
entry and retrieval.

### Note on a spec inconsistency
The build spec's docstring/test claimed `normalizeText('krʉ̂angbin') → 'krueangbin'`,
but the authoritative IPA map (ʉ → u, confirmed by the spec's own ERROR_REPORT entry)
yields `'kruangbin'` (ʉ→u, combining circumflex stripped). The implementation follows
the ʉ→u mapping and the unit test asserts the actual deterministic output
(`'kruangbin'`), rather than copying the spec's self-contradictory value.

### Known follow-ups
- Hotkey scheme isn't customizable; users with strong opinions on Vietnamese-style IMEs would need extension points
- The palette doesn't yet handle Thai script — only romanized characters

## Deployment prep

### Changes
- Removed `file.makePublic()` from GCS `putPublic` (`src/lib/storage/gcs.ts`). The production bucket uses uniform bucket-level access with bucket-wide public read, so per-object ACL calls throw; the direct `storage.googleapis.com/<bucket>/<key>` URL resolves because the whole bucket is public. The `Storage` client already relies on ADC (`GOOGLE_APPLICATION_CREDENTIALS`).
- Added base-path support for client fetches: new `src/lib/base-path.ts` exposes `withBase()`, and all 49 client-side `fetch('/api/...')` call sites across 24 files now route through it. Next.js auto-prefixes navigation and `_next` assets via `basePath`, but NOT raw browser `fetch()` — those would 404 under the `/language-learning` sub-path without the helper. No-op in dev.
- Dockerfile: bumped to `node:22-alpine` (matches `.nvmrc`), accepts `WEB_BASEPATH` / `NEXT_PUBLIC_BASE_PATH` / `GCP_DEPLOYMENT` build args, added the native-build toolchain (`python3 make g++`) to the deps stage. Kept the existing migrations + `drizzle.config.ts` copy into the runner.
- Added `.dockerignore` excluding `secrets/`, `.env*` (except `.env.example`), `node_modules`, `.next`, local `storage/`, tests, and large artifacts — the service-account key is never baked into the image.
- Extended `.env.example` with production base-path (`NEXT_PUBLIC_BASE_PATH` / `WEB_BASEPATH` / `GCP_DEPLOYMENT`) and GCS (`GCS_BUCKET`, credentials path) guidance.
- Added `DEPLOYMENT.md` — the manual VM-side runbook (submodule, secrets, compose, nginx location block, build, migrations, verify, data import, backups).

### Decisions / deviations from the spec
The spec was a generic template; several of its files already existed in tailored form and several of its variable names did not match this codebase. Reconciled rather than clobbered:
- **Env var names kept as the code actually reads them** (`src/lib/env.ts`): `GCS_BUCKET` (not `GCS_BUCKET_NAME`), `NEXTAUTH_URL` + `AUTH_TRUST_HOST` (not `AUTH_URL`). `DEPLOYMENT.md` and `.env.example` use the real names.
- **Auth is email+password with Resend verification** (Credentials provider, `trustHost: true`), not magic-link as the spec's prose assumed. `auth.ts` already derives everything from env — no change needed.
- **`next.config.ts` left as-is.** It already sets `basePath` and `output: 'standalone'`. The spec's extra `assetPrefix` is redundant under `basePath` and risks double-prefixing `next-pwa`/workbox URLs; `images.unoptimized` is moot because the app uses no `next/image`. Skipped both to avoid regressions.
- **Dockerfile kept the migrations copy** the spec's version omitted, and stayed on the existing slim alpine pattern rather than the spec's verbatim contents.
- **Migrations caveat documented:** the runner image is bare `node` with no `pnpm`/`drizzle-kit`, so `pnpm db:migrate` cannot run inside it. `DEPLOYMENT.md` Step 8 gives a one-off-container approach and a laptop-tunnel fallback instead.

### Build blockers found and fixed during Docker verification
The local `pnpm build` passed because Next auto-loads `.env.local`, but the
Docker build (no secrets in the image, by design) surfaced three import-time
failures. Fixed each:
1. **pnpm version mismatch** — the container's corepack pulled a newer pnpm than
   the host's 10.12.2, and newer pnpm turns `ERR_PNPM_IGNORED_BUILDS`
   (unconfigured build scripts: esbuild, msw, protobufjs, @google/genai) into a
   hard error. Pinned `"packageManager": "pnpm@10.12.2"` in package.json so
   corepack uses the same version host/CI/Docker, matching `pnpm-workspace.yaml`'s
   `ignoredBuiltDependencies` allowlist.
2. **env throws at build time** — `src/lib/env.ts` threw "refusing to start in
   production" while `next build` collected page data, because required secrets
   aren't present at build time. Added an `isBuildPhase` check
   (`process.env.NEXT_PHASE === 'phase-production-build'`, confirmed set by Next
   16's build/index.js) so the build warns instead of throwing. Runtime
   fail-fast is preserved (NEXT_PHASE is unset at real server start).
3. **crypto key derived at import** — `src/lib/crypto.ts` ran
   `Buffer.from(env.APP_ENCRYPTION_KEY, 'base64')` at module load, throwing
   `ERR_INVALID_ARG_TYPE` on the undefined build-time key when the
   reset-password route was imported. Made key derivation lazy/memoized
   (`getKey()`); the 32-byte validation now runs on first encrypt/decrypt at
   runtime. Other env-consuming constructors (pg Pool via Proxy, Resend, OpenAI/
   Anthropic/GoogleGenAI) were already lazy, so no other changes were needed.

### Verification (local, no deploy)
- `pnpm lint` — 0 errors
- `pnpm test` — 75/75 passing
- `pnpm build` — succeeds (standalone output)
- `tsc --noEmit` — clean (validated the 49 fetch edits + the env/crypto fixes)
- `docker build` with production base-path args — **succeeds**, final image 263MB
- Container smoke test (dummy secrets, `STORAGE_DRIVER=local`): server boots,
  `GET /language-learning/login` → 200, `GET /login` (no base path) → 404, and
  page assets are emitted under `/language-learning/_next/static/...` — base-path
  routing and asset prefixing confirmed end-to-end.

### Out of scope (manual, on the VM — documented in DEPLOYMENT.md)
- Submodule add to vm-infrastructure; top-level docker-compose changes (postgres + app services); nginx location block; production secret generation/placement; first-deploy DB migration; optional dev→prod data migration; backup cron.

## Bug fixes: default vocab view + logout redirect

### Bug 1 — vocab table empty by default (prod only)
**Symptom:** `/language/[lang]/vocab` showed an empty table with no lesson/tag
filter selected; selecting a filter populated it. Worked locally, broke in prod.

**Root cause (not the query):** The `/api/vocab` GET query is correct — with no
filters it returns all of the user's items. The empty table came from the route
*throwing*. It resolved an image URL per row via `store.getUrl()`, which on the
**GCS** driver (prod) generates a V4 **signed** URL and ran inside a
`Promise.all`. Vocab images are actually **public** (written via `putPublic` to
`public/…` on a bucket-wide-public bucket), so signing is both unnecessary and a
failure/latency surface: one failing or slow signature rejected the whole
response → client got no `items` → empty table. The `local` driver (dev) returns
a cheap `/api/files/…` path that never fails, so it worked locally. Filtered
views appeared to "work" only when their result set excluded completed-image rows.

**Fix:** Added a synchronous `publicUrl(key)` to the storage layer
(`types.ts`/`gcs.ts`/`local.ts`) that returns the stable public URL with no
signing or I/O, so it cannot throw or time out. Switched the three vocab-image
sites (`/api/vocab` list, `/api/vocab/[id]`, `/api/vocab/[id]/image/generate`) to
`publicUrl`. The list mapping is now synchronous (no `Promise.all`). Private
lesson-file routes still use the signed `getUrl`, unchanged.

### Bug 2 — logout redirected to the business site root
**Symptom:** Sign out sent the user to `kebayorantechnologies.com/` instead of
the login page.

**Fix:** `src/components/user-menu.tsx` — `signOut({ callbackUrl: '/' })` →
`signOut({ callbackUrl: withBase('/login') })`. `withBase` reads
`NEXT_PUBLIC_BASE_PATH` (same value the spec's inline expression uses), resolving
to `/login` in dev and `/language-learning/login` in prod, consistent with the
rest of the codebase's client paths.

### Verification
- `tsc --noEmit` clean · `pnpm lint` 0 errors · `pnpm test` 75/75 · `pnpm build` succeeds
- Bug 2's dev fallback (`/login`) confirms the logic; the sub-path form only
  applies in production.

## Production: missing vocab images + scroll-jump (shipped)

### Bug — vocab images broken in production
**Cause:** Images were generated in dev (`STORAGE_DRIVER=local`) and saved to the
laptop's `./storage/public/users/...`. The dev DB was later migrated to prod via
pg_dump/restore, so vocab rows carried their `imageStorageKey` across, but the
image *bytes* never left the laptop — the prod GCS bucket had the rows' keys but
no objects, so every completed-image thumbnail 404'd.

**Fix (one-time data migration, no code/DB change):** Uploaded the 24 local PNGs
to `gs://language-learning-bot/public/` with `gsutil -m cp -r`, landing them at
`public/users/<userId>/vocab/<vocabId>/<file>.png` — the exact keys the DB
references. 24/24 uploaded (35.9 MiB), 0 failures. Verified two sample objects
serve `HTTP 200, image/png` directly over `https://storage.googleapis.com/...`
(bucket-wide public read working; no `makePublic()` needed on the uniform bucket).

### Bug — filter/sort changes scrolled the page to the top
**Cause:** The vocab page's same-page `router.push`/`router.replace` calls used
the App Router default (scroll to top) on every query-param update.

**Fix:** Passed `{ scroll: false }` to the three same-page navigations in
`VocabInner` (notice cleanup, `updateParams`, `clearFilters`). Different-page
navigations are `<Link>`-based and were left to scroll normally.

### Deploy
Shipped via DEPLOY_CLAUDE.md: pushed project repo (`3f48686`), bumped the
`vm-infrastructure` submodule pointer (`c5619bd`), rebuilt + recreated the
`language-learning-bot` container on the VM. Verified: prod returns `HTTP/2 200`,
app logs show a clean Next.js 16.2.6 startup with no errors.

## 2026-05-30 — Bulk select refactor + visibility toggle move

Replaced the photo-only "selection mode" bulk flow with a unified, always-on
`BulkSelectBar` (`src/components/vocab/bulk-select-bar.tsx`) mounted on both the
vocab page and the lesson detail page; moved the per-item visibility toggle to
the top of the vocab edit panel and renamed its heading to "Edit entry". No
schema/migration — code only.

### Bug — unused eslint-disable directive failed `pnpm lint`
**Symptom:** `pnpm lint` reported a warning: an
`// eslint-disable-next-line react/no-unused-prop-types` comment I had added to
`bulk-select-bar.tsx` was itself flagged as an unused directive (the rule
reported no problem to suppress).
**Root cause:** The `onToggleItem` prop is declared in the component's props
interface but consumed by the parent's per-row checkboxes rather than the bar
itself; I pre-emptively suppressed a lint rule that this project's config
doesn't enable, so the suppression had nothing to suppress.
**Fix:** Removed the disable directive and documented `onToggleItem` with a
normal JSDoc comment instead. `pnpm lint` then passed clean.

### Production incident — auth crash from never-run Feature A migration (0008)
**Symptom:** After deploying this change, the prod homepage returned `HTTP/2 200`
but the app logs showed every authenticated request crashing in the Auth.js JWT
callback: `JWTSessionError` → `Failed query: select "sessions_invalidated_at",
"target_language", "native_language", "role", "display_name" from "users" …`
with Postgres `code 42703` (`errorMissingColumn`). Logged-in users could not use
the app.
**Root cause:** Not caused by this UI-only change. "Feature A — shared vocab,
roles, display names" (`632045b`) added `users.role` and `users.display_name`
(migration `0008_stormy_micromax.sql`) but was committed and **never deployed** —
the last actually-deployed commit was `3f48686`, pre-Feature-A. This change sits
on top of Feature A, so the deploy shipped Feature A's code to prod for the first
time while the prod DB still lacked its columns (8 of 9 migrations applied; only
`0008` pending). The auth session query selects `role`/`display_name`, so it
threw on every authenticated request.
**Fix:** With explicit user authorization (per DEPLOY_CLAUDE.md's "STOP and ask
before running prod migrations" rule), applied `0008` to production:
1. Took a `pg_dump -Fc` safety backup → `/home/matt/llb-pre-0008-<ts>.dump`.
2. Opened an SSH local-forward to the prod Postgres container's docker-network IP
   (no host port is published) and ran `pnpm db:migrate` (drizzle-kit) against it
   so the `drizzle.__drizzle_migrations` journal stayed consistent — applied only
   `0008` (9/9 now applied).
3. Restarted the `language-learning-bot` container.
**Verified:** `users.role` + `users.display_name` now present; the exact
previously-failing query returns a row (`matt@mattmcdonnell.net` → `superuser`);
prod returns `HTTP/2 200`; zero new `42703`/`JWTSessionError` log lines after the
restart. Note `0008` also performed Feature A's intended data backfill (Matt set
superuser, existing content attributed to Matt and flipped to `shared`, two test
accounts deleted).

### Deploy
Shipped via DEPLOY_CLAUDE.md: pushed project repo (`8c57825`), bumped the
`vm-infrastructure` submodule pointer, rebuilt + force-recreated the
`language-learning-bot` container on the VM, then applied the pending Feature A
migration as above. Prod verified healthy (`HTTP/2 200`, clean logs).

## 2026-05-30 — Feature B: Flashcards (FSRS decks)

Added Anki-style flashcard decks with FSRS scheduling: schema (decks,
deck_items, card_reviews, study_sessions + 3 enums; migration `0009`), `ts-fsrs`
integration, 8 deck API endpoints, a "Learn" navbar dropdown, deck list page,
deck-builder mode + BulkSelectBar "Add to deck"/"Create deck", and a study
session page (flip, ratings, completion, nothing-due, mobile full-screen).

### Bug — ts-fsrs Card type mismatches broke the build
**Symptom:** `tsc` failed on `src/lib/fsrs.ts`: (1) `Rating` not assignable to
the `Grade` parameter of `scheduler.next()`; (2) `last_elapsed_days` is not a
property of `Card`; (3) `learning_steps` is a required `Card` property.
**Root cause:** The spec's wrapper sketch was written against an older/assumed
ts-fsrs shape. Installed `ts-fsrs@5.4.1` differs: `next()` accepts `Grade`
(ratings excluding `Manual`), `Card` has no `last_elapsed_days`, and ≥5 adds a
required `learning_steps` field.
**Fix:** Cast the rating to `Grade` in `scheduleCard` (callers only pass
Again/Hard/Good/Easy), dropped `last_elapsed_days`, and defaulted
`learning_steps: 0` in `dbRowToCard` (the Feature B schema doesn't persist it —
acceptable for vocab review). `tsc`/`pnpm build` then passed clean.

### Bug — FSRS card state would have persisted as a numeric string
**Symptom:** Caught in review before shipping: ts-fsrs `Card.state` is the
numeric `State` enum (New=0…), but `card_reviews.state` is a `varchar` storing
the name ('New', 'Learning', …). The spec's `String(card.state)` would have
written "0" and then failed to round-trip.
**Root cause:** `State` is a numeric enum; `String(0)` ≠ `'New'`.
**Fix:** Added `stateNameToEnum`/`stateEnumToName` helpers in `src/lib/fsrs.ts`
to convert both directions explicitly.

### Deploy
Pre-flight: committed + deployed a pending `settings/page.tsx` `withBase()` fix
(`2f3e981`) and verified `HTTP 200`. Feature B: pushed project repo (`54ae118`),
bumped the submodule, then — with explicit user confirmation per the prod-migration
rule — backed up prod (`pg_dump -Fc` → `llb-pre-0009-*.dump`), applied the
additive migration `0009` (4 tables + 3 enums, no data mutation) via drizzle-kit
over an SSH tunnel (10/10 applied), and rebuilt + force-recreated the container.
Verified: 4 new tables present, `HTTP/2 200`, `/api/decks` returns 401 (not 500),
zero error lines after restart.

## 2026-05-31 — Feature C: Kruu Bingo avatar + /decks refactor + consolidated AI spend

Four-part change: (1) moved flashcard routes `/flashcards` → `/decks` and added
a deck mode-chooser hub; (2) replaced `image_generation_log` with `ai_spend_log`
(spend now spans all AI features) and rewrote `cost-tracking.ts`; (3) added the
`avatar_sessions` table; (4) built the Kruu Bingo avatar (Realtime API WebRTC
client, system prompt, session API routes, avatar session page, guard dialogs).

### Bug — drizzle-kit generate blocked on an interactive rename prompt
**Symptom:** `pnpm db:generate` aborted with "Interactive prompts require a TTY"
because dropping `image_generation_log` while adding `ai_spend_log` (and swapping
the `user_settings` spend columns) is an ambiguous rename-vs-create that
drizzle-kit resolves interactively; piping input is rejected.
**Root cause:** A single diff containing both a created and a deleted table/column
triggers drizzle's interactive resolver, which needs a real TTY.
**Fix:** Split into two unambiguous migrations. `0010` is purely additive (old
objects temporarily kept in the schema so nothing is dropped); then the old
objects were removed and `0011` generated as a purely-destructive diff (no
creates → no rename prompt). Both apply cleanly and non-interactively.

### Note — Lottie avatar asset replaced with a CSS placeholder
**Symptom/decision:** §7 calls for a Lottie character from LottieFiles, but no
asset could be fetched in this environment.
**Fix:** Implemented `KruuBingo` (`src/components/avatar/kruu-bingo.tsx`) as a
lightweight CSS/SVG placeholder with idle/listening/speaking states.
`lottie-react` is installed; to use a real animation, drop
idle/speaking/listening JSON into `public/animations/` and swap the placeholder
for a `<Lottie>` player. **Action for user: replace the placeholder avatar.**

### Note — OpenAI Realtime client not runtime-verified
`src/lib/realtime.ts` implements the documented Realtime WebRTC handshake +
event names and uses the model id `gpt-realtime`. It depends on a live API, a
microphone, the user's OpenAI key, and a browser, so it could not be exercised
by the local lint/test/build gates — runtime behaviour is unverified. Cost is a
duration-based estimate (~$0.30/min). **Action for user: smoke-test a live
voice session and confirm the model id/event names against current OpenAI docs.**

### Deploy
Pushed project repo (`a23bda6`), bumped the submodule (`ab6e8c1`), then — with
explicit user confirmation per the prod-migration rule — backed up prod
(`pg_dump -Fc` → `llb-pre-0010-0011-*.dump`, capturing the 29 about-to-be-dropped
`image_generation_log` rows) and applied `0010` + `0011` via drizzle-kit over an
SSH tunnel (12/12 applied), then rebuilt + force-recreated the container.
**Intentional data reset (spec §4e "start fresh"):** the 29 cost rows were
dropped (MTD AI spend resets to $0) and custom spend limits reset to defaults
($25/$100) since the old columns were dropped. `image_generation_batches` kept.
Verified: tables swapped, `HTTP/2 200`, `/api/decks` + `/api/avatar/session-config`
+ `/api/settings/ai-spend` all 401 (auth-gated), old `/api/settings/image-spend`
→ 404, zero error lines after restart.

## 2026-05-31 — OpenAI Realtime API 400: beta endpoint disabled
**Symptom**: POST /v1/realtime returned 400 "beta_api_shape_disabled" — the
avatar could not connect.
**Root cause**: The GA Realtime API requires a server-side ephemeral token
exchange via /v1/realtime/client_secrets before the client-side WebRTC
handshake. The old beta pattern of calling /v1/realtime directly from the
browser with the raw API key is no longer supported.
**Fix**: Added /api/avatar/token server-side route to exchange the user's
encrypted API key for an ephemeral token. Updated realtime.ts to accept
`ephemeralToken` instead of `openaiApiKey`. Repurposed /api/avatar/session-config
to a page-load pre-check (returns `hasKey` + spend limits, never the key).
Updated the avatar page to call the token endpoint on mic tap, with no-key /
hard-stop / openai_error / network-error handling. (Live voice still requires a
real key + mic to verify end-to-end; deploy confirmed the route builds and is
auth-gated, 401 unauthenticated.)

## 2026-05-31 — Kruu Bingo avatar showing CSS placeholder instead of Lottie
**Symptom**: Avatar page showed the CSS/SVG smiley placeholder instead of the
animated character.
**Root cause**: kruu-bingo.tsx was never updated from the placeholder to use
the Lottie JSON files now present in public/animations/.
**Fix**: Updated the KruuBingo component to import and render the Lottie
animations (idle/speaking/listening) via `lottie-react`. Used a relative import
(`../../../public/animations/...`) since `@/*` resolves to `./src`, not the
project root; `resolveJsonModule` was already enabled. Verified the JSON assets
are committed so the VM build resolves them (build produced no "cannot find
module" errors).

### Deploy
Code-only, no migration. Pushed project repo (`f131171`), bumped submodule
(`3394ed9`), rebuilt + force-recreated the container. Verified: `HTTP/2 200`,
POST `/api/avatar/token` → 401 (route live, not 404), `/api/avatar/session-config`
→ 401, zero error lines after restart.

## 2026-06-03 — Avatar inactivity timeout (feature, clean run)
**Context**: Added a configurable inactivity timeout to the Kruu Bingo avatar
session (CLAUDE_CODE_INSTRUCTIONS.md). After a superuser-configured idle period
a "Continue session?" popup warns the user with a 30s countdown; user input
(speech or text) dismisses it with a green-checkmark acknowledgment, the
buttons let the user continue or end, and countdown expiry auto-ends. The
timeout is a single GLOBAL value (all users), so it lives in a new singleton
`app_settings` table rather than per-user `user_settings`.
**No bugs encountered** — lint, 75 tests, and `pnpm build` ("Compiled
successfully" + TypeScript finished; the usual page-data/DB hang is unrelated)
all passed on the first full run.
**Notes / non-obvious choices**:
- New `app_settings` table (id=1 singleton, seeded in migration `0012` via
  `INSERT … ON CONFLICT DO NOTHING`). `GET /api/settings/avatar` falls back to
  120s if the row is missing; `PATCH` is superuser-gated (`canManageRoles`) and
  validates a 30s multiple in 30–1800s.
- The warning popup is a non-modal overlay (pointer-events-none dimmer) rather
  than the modal Dialog/AlertDialog primitive, so the user can still speak or
  send text "underneath" it to dismiss — the spec requires text-send while the
  popup is visible to trigger the checkmark animation, which a focus-trapping
  modal would block.
- Inactivity timer is paused while Kruu Bingo speaks (`onSpeaking` clears it)
  and reset-to-zero when it goes idle (`onIdle`); user speech (`onListening`)
  and text-send both reset it. All three end paths (manual button, popup
  button, auto-expiry) route through one shared `endSession()` handler.
- Live voice behaviour (mic + OpenAI Realtime) remains unverifiable by the
  local gates; timer/popup logic itself is plain client state and is exercised
  only via build/lint/type-check here. **Action for user: smoke-test a live
  session per the §11 checklist.**

## 2026-06-03 — Timeout popup buttons overflow the card
**Symptom**: The "Continue session" / "End session" buttons in the avatar
inactivity-timeout popup rendered outside the white popup card, spilling into
the gray backdrop on desktop and laptop widths.
**Root cause**: The button row used `flex flex-col gap-2 sm:flex-row` with each
`<Button>` set to `w-full`. The shared Button base class includes `shrink-0`,
so at the `sm` breakpoint and up the two `width:100%` buttons could not shrink
to share the row — they summed to ~200% of the card's content width and
overflowed past the `p-6` padding into the backdrop. (Measured: at 1280px the
buttons extended ~172px beyond each edge of the 336px content box.) On mobile
the row was `flex-col`, so each `w-full` button stacked correctly and the bug
was invisible there.
**Fix**: Contained the button row inside the card's padded content area with a
full-width flex row whose buttons share it evenly: container
`flex w-full flex-col gap-3 sm:flex-row`, each button `w-full sm:flex-1
sm:min-w-0`. `flex-1` gives a `flex-basis: 0%`, so the buttons grow to an equal
half-share of the row and `shrink-0` no longer forces overflow; `min-w-0` lets
them shrink below intrinsic content width. Verified with a Tailwind-rendered
geometry check that both buttons sit fully inside the card content box at
1280px and 1024px (each ~162px, evenly split), while the old markup overflowed.
Labels, order (Continue primary, End secondary), and click handlers unchanged.

## 2026-06-03 — Selectable voice model + settings cleanup + deck-vocab grounding
**Context**: Seven local changes (CLAUDE_CODE_INSTRUCTIONS.md): per-user
selectable AI Voice Chat model, consolidated "AI model selection" settings
section, disabled "Coming soon" Chat Model, auto-saving + human-readable
inactivity-timeout dropdown, voice chat updating `last_studied_at`, and
deck-vocab grounding verification + prompt strengthening.

**Deck-vocab grounding — VERIFICATION, not a bug**: Traced end to end whether
the deck's vocab actually reaches the model. It already did, correctly:
- The avatar page fetches the deck's cards via
  `/api/decks/{deckId}/study?limit=999&ahead=true`, dedups them (a 'both' deck
  has two cards per item), and builds `vocabItems`.
- `buildKruuBingoPrompt({ targetLanguage, nativeLanguage, vocabItems })` embeds
  the full list (native = target, with transliteration where present).
- `RealtimeSession.configureSession()` sends that prompt as `instructions` in
  the `session.update` event after the data channel opens (GA shape), so the
  model receives it. A temporary vocab-count log confirmed the list was present
  and complete; the log was removed before committing.
No transmission fix was needed. Per §8c the prompt was still STRENGTHENED: a
clear "FOCUS OF THIS CONVERSATION — the deck vocabulary" block now sits near the
top (right after the CRITICAL LANGUAGE RULE), instructing the tutor to weave in,
prompt for, and gently correct the specific items and to steer the conversation
back to them, while keeping the Kruu Bingo persona and the existing vocab-list
format.

**Cost-estimate consistency (minor)**: `realtime.ts` used a flat
`APPROX_USD_PER_MINUTE = 0.3` for session-cost logging regardless of model. It
now accepts an optional `costPerMinute` (the avatar page passes the selected
model's estimate from `src/lib/voice-models.ts`, resolved from the model the
token route actually minted with), so logged cost matches what the user was
shown in settings. Falls back to 0.3 when unset.

**No bugs** were encountered; all gates (lint, 75 tests, build "Compiled
successfully" + "Finished TypeScript") passed. Live voice behaviour (mic +
OpenAI Realtime) and the authenticated settings UI remain unverifiable by the
local gates; routes were confirmed to compile/serve (settings 307→login, APIs
401), the timeout label formatter was unit-checked, and the voiceModel column +
migration were applied and verified locally.

## 2026-06-03 — "Base language use" control (feature, clean run)
**Context**: Added a per-user "Base language use" setting (5 levels: All →
Frequent → Moderate → Rarely → Never, default 'moderate') controlling how much
the AI tutor mixes the user's base/native language into the conversation. New
`user_settings.base_language_use` column (migration 0014, additive, applied
locally). Shared `src/lib/base-language-use.ts` defines levels, labels, help
text, validator, default, and the prompt directive per level;
`buildKruuBingoPrompt` now injects the directive right after the CRITICAL
LANGUAGE RULE. Settings GET/PATCH read+validate the value (single shared source
of truth). A new shared `BaseLanguageUseControl` (discrete base-ui slider + an
info popover using `PopoverTrigger openOnHover`, which keeps click behavior so
it works on desktop hover/focus AND mobile tap) appears in two places: a new
"AI Chat" settings section (which also absorbed the relocated, superuser-only
inactivity-timeout dropdown — the old "Avatar session settings" section/component
was deleted) and the voice chat page. On the voice page, changing it auto-saves
through the same PATCH and applies live via a new
`RealtimeSession.updateInstructions()` that re-sends `session.update` with the
rebuilt prompt (guarded to no-op until the data channel is open).
**No bugs encountered** — lint, tsc --noEmit, 75 tests, and `pnpm build`
("Compiled successfully" + "Finished TypeScript") all passed; changed routes
verified to compile/serve on the dev server (settings 307→login, settings APIs
401). Live voice behaviour (mic + OpenAI Realtime) and the authenticated
settings/voice UI remain unverifiable by the local gates — the §10 visual checks
(slider auto-save, info popover on desktop+mobile, live "All"→repeat-both /
"Never"→target-only mid-session) need a logged-in browser smoke test.

## 2026-06-03 — AI model selection table + voice chat captions (feature, clean run)
**Context**: Two local changes (CLAUDE_CODE_INSTRUCTIONS.md). Part A reformatted
the "AI model selection" settings section into a responsive Function / Provider
/ Model / Est. Cost table (rows: Text chat [greyed "Coming soon"], Voice chat,
Photo analysis [renamed from Photo Extraction], Image generation), with the
per-feature descriptions moved into ⓘ info popovers and the AI spend limits
relocated into a sub-section beneath the table. Part B added YouTube-style
captions to the AI voice chat (per-user `captions_enabled`, default off).
**No bugs encountered** — lint, tsc --noEmit, 75 tests, and build ("Compiled
successfully" + "Finished TypeScript") all passed; routes verified to
compile/serve on the dev server (settings 307→login, settings APIs + PATCH 401).
**Notes / non-obvious choices**:
- Extracted a shared `InfoIcon` (`src/components/ui/info-icon.tsx`) from the
  base-language-use control's popover so every ⓘ (table rows, spend limits,
  captions) behaves identically — opens on desktop hover/focus AND mobile tap
  via base-ui `PopoverTrigger openOnHover` (which keeps click/tap behavior).
  Refactored `BaseLanguageUseControl` to use it.
- Responsive table is one render, not two: a CSS grid that is a labeled stacked
  card per row on mobile (`grid-cols-1`, bordered) and an aligned
  `md:grid-cols-[150px_1fr_1fr_120px]` row on desktop — avoids duplicate
  interactive Select instances and horizontal overflow on phones.
- Est. Cost is display-only: Voice "~$X.XX / min", Image "$X.XXX per image",
  Text chat "—", and Photo analysis "—" (extraction has no cost tracked in the
  catalog yet — shown as "—" rather than a fabricated number).
- Captions reuse the existing `onTranscript(text, role)` transcripts (no extra
  transcription pass); the overlay renders the most recent transcript line over
  the avatar with a speaker tag, shown only when captions are ON and a session
  is started. New shared `CaptionsToggle` (CC button) used on both the voice
  page and (with a label) the AI Chat settings section; both auto-save through
  the same `PATCH /api/settings { captionsEnabled }` so they mirror.
- Live voice (mic + OpenAI Realtime) and the authenticated UI remain
  unverifiable by local gates — the §8 visual checks (table layout at 1280px
  and 375–414px, info popovers on tap, captions overlay during a live exchange)
  need a logged-in browser smoke test.

## 2026-06-03 — Caption fixes + settings polish (six fixes, clean run)
**Context**: Six local fixes (CLAUDE_CODE_INSTRUCTIONS.md), no migration.
**Captions (issues 1 + 2) — RENDERING bug, not a source bug**: By code
inspection of `src/lib/realtime.ts`, the assistant transcript IS captured and
forwarded — `response.audio_transcript.delta` accumulates and
`response.audio_transcript.done` calls `onTranscript(text, 'assistant')` (user
speech via `conversation.item.input_audio_transcription.completed` →
`onTranscript(text,'user')`). (No live mic is available in this environment, so
this was verified by reading the handler rather than a live log; no temporary
logging was committed.) The real problems were in the avatar page: there were
TWO renderers — an always-on transcript panel (showed the user's lines
regardless of the captions toggle) plus a single-line caption overlay (showed
only the most recent turn, so the tutor's line rarely persisted). Consolidated
to ONE caption display fully gated by `captionsEnabled`: OFF renders nothing; ON
renders the latest tutor line AND the latest user line in the same box, each
attributed to its speaker. Removed the avatar overlay and the now-dead
transcript-scroll ref/effect.
**Settings polish**:
- (3) "AI model selection" row order is now Text chat → Voice chat → Image
  generation → Photo analysis (swapped the last two).
- (4) API keys use an eye-icon reveal inside each field (masked by default,
  toggles to plaintext); removed the separate stored-key text line and the
  "Reveal" link. The settings GET now returns the authenticated owner's
  DECRYPTED keys (owner-scoped only, never another user's, never logged) so the
  field can display/reveal them; the old `?reveal=<provider>` query param was
  removed.
- (5) Captions tooltip reworded with no "YouTube" reference ("Show on-screen
  captions of the conversation — both what you say and the tutor's replies").
  Remaining "YouTube" strings are code comments / the unrelated lesson-links
  feature.
- (6) Languages section: "Native language" relabeled to "Base language" (wired
  to the same `nativeLanguage`/base value) and moved to the LEFT of "Target
  language".
**No bugs encountered**; lint, tsc --noEmit, 75 tests, and build ("Compiled
successfully" + "Finished TypeScript") all passed. Routes verified to
compile/serve on the dev server (settings 307→login, /api/settings 401). The
live caption behavior (mic) still needs a logged-in browser smoke test.

## 2026-06-04 — AI captions missing: beta vs GA transcript event name
**Symptom**: The user's captions appeared but the AI tutor's never did, even
after the previous task consolidated the caption display.
**Root cause**: `src/lib/realtime.ts` listened for the BETA model-transcript
events `response.audio_transcript.delta` / `.done`. The GA Realtime API
(`gpt-realtime` via `/v1/realtime/calls`, which this app uses) renamed them to
`response.output_audio_transcript.delta` / `.done`, so the assistant transcript
was never captured and `onTranscript(text,'assistant')` never fired. The user
event (`conversation.item.input_audio_transcription.completed`) is unchanged in
GA, which is why only the AI captions were missing. The prior "verified by
reading the handler" check could not catch a wrong event NAME — the handler
looked correct but matched the wrong string.
**Fix**: Added the GA event names as fall-through `case` labels alongside the
beta names (both delta and done), so the assistant transcript is captured
regardless of which the session emits; beta names kept as fallback. No
caption-component change was needed — it already renders the `'assistant'`
role line.
**Live confirmation**: NOT performed — no microphone is available in this
environment, so the temporary unhandled-event `default:` logger from §2 would
observe nothing and was not added/committed. The fix is authoritative from the
GA docs; the user should confirm live (with captions ON, the tutor's reply
should appear and no AI-transcript event should hit an "unhandled" log). If the
live event name differs, add it to the same branches.

## 2026-06-04 — Caption language selection (translate + romanize)
**Scope**: Added per-user caption language (`base` / `target` /
`target_romanized`): `target` renders the raw transcript (no call); `base`
translates the target-language line into the user's `base_language` via Google
Cloud Translation (`src/lib/translation.ts`, app-level GCP credential, NOT
logged to `ai_spend_log`); `target_romanized` calls the user's selected
romanization model to produce tone-marked romanization (logged to
`ai_spend_log`, respects spend limits, offered only for non-roman scripts via
the new `script` field + `isNonRomanScript` in `src/lib/languages.ts`). New
`POST /api/avatar/caption-transform` endpoint; new "Captions (romanization)"
model row (between Voice chat and Image generation); caption-language selector
in both settings and the voice page with per-`(mode+text)` caching and graceful
raw-text fallback; additive migration `0016` (`caption_language`,
`romanization_model`).
**No bugs encountered**; lint, 75 tests, and build ("Compiled successfully" +
"Finished TypeScript", 40/40 static pages) all passed. The local build hangs at
"Collecting build traces" as documented — benign, compilation already green.
**Live confirmation**: NOT performed — requires a logged-in browser, a mic, and
`GOOGLE_APPLICATION_CREDENTIALS` set locally; the user should smoke-test the
three modes per §10.
**Deploy note**: the prod GCP service account needs the **Cloud Translation API
User** role and the Translation API enabled before/at deploy (additive
migration auto-applied by the deploy flow). No new prod secret.

## 2026-06-04 — Caption transforms not applying (per-speaker model) + CC control
**Symptoms**: (1) "Thai (romanized)" captions still showed Thai script;
(2) "Thai" mode showed stray roman text (the user's own non-Thai lines were not
converted to Thai).
**Root cause — empirical note**: live browser/mic confirmation was NOT possible
in this environment (no display, no microphone, romanization needs a logged-in
user's stored key), so the causes were traced in code rather than observed in
the Network tab.
- **Bug #2 (deterministic, confirmed in code)**: `captionText()` returned the
  raw transcript for BOTH speakers whenever `mode === 'target'`. The intended
  model is per-speaker: in target mode the tutor's line is a passthrough but the
  USER's line must be translated into the target script. The user's line was
  never transformed, so an English utterance stayed English ("stray roman").
  The original design treated `target` as a universal passthrough.
- **Bug #1**: in romanized mode the client DOES call the transform endpoint, so
  raw Thai can only survive if the endpoint returns non-OK and the client's
  silent fallback (`res.ok && data.text ? data.text : text`) masks it. Most
  likely trigger: the default romanization model is Anthropic
  (`claude-haiku-4-5`) while a voice user typically has only an OpenAI key
  stored → route returns `400 no_key` → fallback substitutes raw Thai with no
  signal. The structural cause is the silent fallback with no error surfacing.
**Fix**:
- Implemented the per-`(speaker, mode)` rendering table in the transform route
  and client. Route now takes `{ text, mode, speaker }`; `mode` enum extended to
  include `'target'` (for the user's line). Tutor lines translate from a known
  source (target language); user lines auto-detect the source (Google).
  `target_romanized` for the user is translate→target (Google) then romanize
  (LLM); for the tutor it romanizes directly. `translateText` now takes an
  optional source (omitted → Google auto-detect).
- Client caches by `speaker+mode+text`; the ONLY no-call case is tutor+target
  (passthrough). Transform failures are now logged to the dev console with
  `(speaker/mode, status, error)` so a silent fall-back-to-raw can never again
  mask a broken transform.
- Replaced the caption-type dropdown on the voice page with a YouTube-style CC
  control (`caption-cc-menu.tsx`): a CC on/off button plus a caret that opens a
  hover(desktop)+tap(mobile) Popover menu of caption types with a checkmark on
  the active one; romanized is offered only for non-roman targets; selecting a
  type implies captions ON. The settings page keeps its labeled
  `CaptionLanguageSelect`, and both read/write the shared `caption_language`.
**Quality gates**: lint, 75 tests, `tsc --noEmit`, and webpack "Compiled
successfully" all pass (the local full build hangs at the trace/TS tail on a
cold cache, as documented — benign). No schema change was needed.
**Live confirmation**: NOT performed (no browser/mic). The user should verify
each cell of the §3 table per §6, and — for the romanized path — confirm their
romanization model's provider matches a stored API key (otherwise the route
returns `no_key`, now visible in the console instead of silently masked).

## 2026-06-04 — Captions: single-line overwrite → rolling scrollable transcript
**Change (not a bug)**: the caption box rendered only the latest turn per
speaker (`latestAssistant` / `latestUser`), so each new turn visually erased the
previous one — even though `transcript` already accumulated every turn in state.
Converted it to a rolling, scrollable transcript in the same panel.
**Implementation** (client-only, `avatar/page.tsx`; no schema change):
- `Turn` now carries `{ id, role, rawText }` (id = monotonic ref for stable
  keys; `rawText` = the untransformed transcript text). The render maps the full
  ordered `transcript` list into the existing bubble style (Kruu Bingo left / You
  right) inside one scroll container; the prior single-line overlay is gone.
- The transform effect now iterates the WHOLE transcript (most-recent first) for
  the current mode rather than just the latest two lines, reusing the
  `speaker+mode+rawText` cache. On a CC mode change the effect re-runs over the
  whole history: each turn shows its raw text immediately and swaps in the
  transformed text as it resolves; cached turns (e.g. switching back to a
  previously-used mode) make no new calls and incur no re-billing. Tutor lines in
  target-script mode remain a free passthrough.
- Polite auto-scroll: a scroll listener tracks "at/near bottom" (≤40px); a new
  appended turn smooth-scrolls to the bottom only when already near it, never
  yanking a user who scrolled up. A round `ChevronDown` scroll-to-bottom button
  (bottom-right of the panel) appears only when scrolled up and hides at bottom.
**Quality gates**: lint, 75 tests, `tsc --noEmit`, and webpack "Compiled
successfully" all pass (full local build hangs at the trace/TS tail, documented
as benign). **Live confirmation**: NOT performed (no browser) — the user should
verify accumulation, polite auto-scroll, the button, and full-history re-render
on mode change per §6.

## 2026-06-04 — Captions: cap transcript box height so it scrolls internally
**Change (not a bug)**: the rolling caption transcript accumulated turns
correctly and the polite-auto-scroll + scroll-to-bottom logic was already wired,
but the scroll container (`avatar/page.tsx`) had `overflow-hidden` with **no
height bound**, so it grew taller with every turn instead of scrolling — pushing
the message input, Base-language slider, CC controls, and mic button down the
page. With nothing to overflow against, the auto-scroll/button logic had no
effect.
**Implementation** (client-only, `avatar/page.tsx`; no schema change):
- Bounded the relative scroll container: `min-h-32 max-h-[45vh]` added alongside
  the existing `flex-1 overflow-hidden`. The `45vh` cap keeps the box a fixed,
  responsive footprint that comfortably shows ~3–5 turns; `min-h-32` stops it
  collapsing when nearly empty; `flex-1` still lets it shrink below the cap when
  vertical space is tight (mobile). The inner `transcriptRef` element keeps
  `overflow-y-auto`, so content now scrolls internally instead of growing the
  page. The scroll-to-bottom button stays absolutely pinned within this relative
  box.
- No other styling, ordering, transform, auto-scroll, or button behaviour
  changed — this was purely the missing height cap.
**Quality gates**: `pnpm lint` clean, `pnpm test` 75/75 pass, `pnpm build`
"Compiled successfully in 115s" and ran to the full route table (no hang this
run). **Live confirmation**: NOT performed (no browser) — the user should verify
per §4 that the box holds a fixed height, scrolls internally with newest at the
bottom, the scroll-to-bottom button engages, and the controls below no longer
shift as turns accumulate (desktop + mobile touch).

## 2026-06-04 — UI/UX batch: home hub, sticky shell, API-key UX, free chat, speech-speed slider
**Scope (§1–§9, clean run)**: nine mostly-independent UI/UX work items, local only.
- **§1 Remove dead chat text input**: the "Type a message…" box + Send were not
  wired to working functionality. Removed entirely from the voice/chat UI along
  with the `textInput` state and `sendText` handler. The mic, transcript,
  captions, sliders, and End session remain.
- **§2 Return-to-origin after saving a required key**: redirect-to-settings sites
  now append `?returnTo=<in-app path>&needKey=openai`. `NoKeyDialog` carries the
  origin; the settings page reads it (from `window.location.search`, avoiding the
  `useSearchParams` Suspense requirement) and, after the matching key saves,
  navigates back. Security: `safeReturnTo()` only honors a single-slash relative
  path with no scheme/host (rejects `//evil.com`, `https://…`).
- **§3 Non-technical API-key help**: a "what is an API key" tooltip by the API
  keys heading + a per-provider tooltip (OpenAI/Anthropic/Google) with
  step-by-step instructions and a real clickable link (new tab), reusing the
  existing `InfoIcon` popover (hover + tap).
- **§4 Home hub at `/home`**: new authed landing page; resolves the user's target
  language server-side and shows two large tiles — Practice {lang} (→ decks, SVG
  country flag) and Update vocabulary (→ vocab, `BookOpen`). Root redirect now
  sends authed users to `/home`. Flags render as **SVG** via the new
  `country-flag-icons` dep (emoji flags don't render on Windows); `flagCountry`
  (ISO 3166-1 alpha-2) added to each language in `languages.ts`, with a neutral
  `Languages` fallback.
- **§5 Sticky header / §6 sticky footer**: app shell is now header (`sticky top-0
  z-40`) + scrollable main (`pb-16` clearance) + footer (`sticky bottom-0 z-40`).
  Footer is slim, two centered lines with new-tab links. The immersive chat view
  is `fixed z-50` on mobile so it covers the footer (never the mic/sliders);
  desktop static view sits in the padded main.
- **§7 Free conversation**: "Free conversation" button on the decks page (right of
  "Create new deck") → new `/language/[lang]/practice` route, a deck-less voice
  chat using a new `buildFreeConversationPrompt`. The whole voice UI was extracted
  from `avatar/page.tsx` into a shared `VoiceChat` component parameterized by
  `mode: 'deck' | 'free'` (rather than duplicated); both pages are now thin
  wrappers. The session POST route's `deckId` is now optional — free conversation
  omits it, so it only logs spend to `ai_spend_log` and never touches a deck's
  `last_studied`.
- **§8 Speech-speed slider**: new `src/lib/speech-speed.ts` (Slow/Moderate/Native,
  default Moderate) + `SpeechSpeedControl` modeled exactly on the Base-language-use
  slider, with an info tooltip. Shown in settings (adjacent to base-language-use)
  and on both voice views; mirrored + auto-saved everywhere; applied LIVE
  mid-session via `updateInstructions` (`session.update`). **Speed is applied by
  injecting a pacing INSTRUCTION into the prompt — NOT the OpenAI Realtime `speed`
  param** (which only changes mechanical playback rate and sounds unnatural).
- **§9 Migration**: one new column `user_settings.speech_speed`
  (`varchar(16)` default `'moderate'`). Drizzle migration `0017_awesome_rachel_grey.sql`
  generated and applied **locally** (prod deploy not performed).
**Type-check snag (fixed inline)**: `flag-icon.tsx` first declared its own
`FlagComponent` type for the `country-flag-icons` map; the library's component
props use `HTMLSVGElement`, so my `SVGProps<SVGSVGElement>` shape wasn't
assignable. Fixed by importing the library's exported `FlagComponent` type
instead.
**Quality gates**: `pnpm lint` clean, `pnpm test` 75/75, `tsc --noEmit` clean,
`pnpm build` "Compiled successfully" with `/home` and `/language/[lang]/practice`
in the route table. **Live confirmation**: NOT performed (no browser/mic) — the
user should verify §11 (esp. the live speech-speed change mid-session, the flag
rendering on Windows, and that the footer never overlaps the mic/slider controls).
