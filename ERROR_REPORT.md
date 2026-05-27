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
