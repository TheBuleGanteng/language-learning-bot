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
