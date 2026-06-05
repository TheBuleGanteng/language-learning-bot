# Security Audit — language-learning-bot

Date: 2026-06-05 · Commit base: `294c19a` (Spec 3) · Scope: the app custodies users'
encrypted API keys, so this audit covers secret handling, authorization/IDOR, role
gating, auth flows, file upload, injection/XSS, dependencies, and transport/headers.

**Methodology:** static review of every `src/app/api/**/route.ts`, the auth/crypto/
rate-limit/visibility libs, the storage layer, and all `dangerouslySetInnerHTML` /
raw-SQL sinks; plus `pnpm audit`. Per the task: clear-cut, low-risk issues were
**fixed**; anything architectural or behavior-changing is **reported** here.

## Summary

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | Personal/global API keys, password hashes, tokens — encryption at rest & non-exposure | — | ✅ Confirmed good |
| 2 | Global API key unreachable by non-superusers (defense in depth) | — | ✅ Implemented (this spec) |
| 3 | Local file content route authorized creator-only (shared consumers blocked) | Medium (avail.) | ✅ Fixed |
| 4 | Link `url` could be `javascript:` → stored XSS on click | Medium | ✅ Fixed |
| 5 | `sql.raw` string-interpolated id list in vocab list | Low (defense-in-depth) | ✅ Fixed |
| 6 | `reset-password` had no rate limit | Low | ✅ Fixed |
| 7 | Missing baseline security headers | Low/Medium | ✅ Fixed (subset); CSP/HSTS reported |
| 8 | Dependency advisories (`pnpm audit`) | 1 High, 5 Moderate | ✅ High fixed; 3 moderate reported |
| 9 | No login (credentials) throttling | Medium | 📋 Recommended |
| 10 | No "last superuser" floor on role demotion/removal | Low | 📋 Recommended |
| 11 | NextAuth cookies rely on framework defaults (no explicit hardening) | Low | 📋 Recommended |
| 12 | `ipFromRequest` trusts `x-forwarded-for` | Low | 📋 Recommended (infra) |
| 13 | `MOCK_EMAIL` logs reset links (token in plaintext) | Low | 📋 Note (dev-only) |

---

## 1. Secret handling — ✅ good

- **Encryption at rest:** personal keys (`user_settings.*_api_key_encrypted`) and the
  new `global_api_keys.encrypted_key` are AES-256-GCM (`src/lib/crypto.ts`,
  `iv|tag|ciphertext`, key from `APP_ENCRYPTION_KEY`). Nothing stores a key in plaintext.
- **Not logged:** no `console.*` logs a key/hash/token. `src/lib/email.ts` `logMock`
  prints the reset link only when `MOCK_EMAIL` is set (see #13).
- **Not in payloads to others:** `/api/settings` GET returns the **owner's own** keys
  decrypted (intentional eye-toggle UI) and never any other user's. `passwordHash` is
  selected for `argonVerify` only and never serialized. `/api/avatar/token` returns an
  ephemeral OpenAI token, never the raw key.
- **Not in URLs:** keys are POST/PATCH bodies, never query strings.

## 2. Global API key — non-superuser unreachable (defense in depth) — ✅

The global key value is protected at **three** layers:
1. **UI:** the Global API keys subsection lives inside the superuser-gated
   `RoleManagementSection`, which returns `null` for non-superusers → not in the DOM /
   server markup / client payload for anyone else.
2. **Endpoints:** `GET/PATCH /api/settings/global-keys` and `POST .../reveal` each
   call `apiUser()` + `canManageRoles` → 403 for non-superusers. Direct API calls,
   element inspection, and the network tab reveal nothing.
3. **Reveal-only value:** the decrypted value is returned **only** from the
   superuser-gated reveal endpoint on an explicit request. The settings GET for a
   normal user returns only a `usingGlobalKey` boolean — never the value.

## 3. AuthZ / IDOR — ✅ (one fix)

Every `:id` data/state route enforces ownership or visibility server-side
(`vocabVisibleSql` / `lessonVisibleSql` / `lessonFileVisibleSql` / `lessonLinkVisibleSql`,
`requireDeckOwner`, `eq(createdBy/userId, me)`), returning 403/404. **No IDOR found.**

**Fixed (#3):** `GET /api/files/[...path]` (local-storage content streaming) previously
authorized *creator-only* via a `users/{sessionUserId}/` key-prefix match, so a shared
consumer got `403 Forbidden` on a shared PDF preview and a broken image thumbnail. It now
allows the owner **or** a viewer who passes `lessonFileVisibleSql` (shared + same target
language) — matching the list reads. Writes (upload/delete) stay creator-only. (GCS uses
signed URLs minted at the already-visibility-aware list/metadata routes, so that path was
already correct.)

## 4. Role gating — ✅

All superuser/admin actions (user management, role change, remove/disable, add-user,
global keys, sharing) gate on `canManageRoles`/`canShare` server-side in addition to UI
hiding. Verified per route.

## 5. Auth flows

- **Tokens:** `verification_tokens` store only a SHA-256 hash; consumption is
  transactional, single-use (`usedAt`), and expiry-checked (`expiresAt > now`). Reset also
  bumps `sessions_invalidated_at`. ✅
- **Fixed (#6):** added a rate limit to `POST /api/auth/reset-password` (10 / 15 min /
  IP) — it was the only token route without one.
- **Disabled accounts:** rejected at login (`authorize`) and force-logged-out mid-session
  (jwt callback invalidates). ✅
- **Recommended (#9):** the NextAuth Credentials `authorize` path has **no throttling** —
  credential stuffing / password brute-force is unthrottled at the app layer. A proper fix
  is architectural in NextAuth v5 (the raw request/IP isn't readily available inside
  `authorize`); recommend a wrapping rate-limit (per IP+email) or an edge/WAF rule. Not
  applied here to avoid changing the auth flow / risking legit-user lockout.

## 6. File upload — ✅

Server-side **content** validation (magic bytes: PDF, audio MIME allowlist, images via
ISO-BMFF sniff incl. HEIC) — not extension-trust. Size limits enforced server-side
(PDF 20MB, audio 50MB, photo 10MB each + 50MB/lesson). Path traversal rejected by the
storage layer. GCS V4 signed URLs are read-only and expire in 15 min. Private lesson files
are never public; the public bucket path is only the unguessable vocab-image route.

## 7. Injection / XSS

- **SQL:** Drizzle parameterizes everything. **Fixed (#5):** the vocab list built an
  `IN (...)` clause via `sql.raw` string interpolation of (UUID-validated) ids — replaced
  with parameterized `sql.join` so it's safe by construction, not just by upstream filter.
  `src/lib/visibility.ts` `sql.raw(alias)` uses only **hardcoded literal** aliases (never
  user input).
- **XSS:** the single `dangerouslySetInnerHTML` sink (`RenderedHtml`) sanitizes with
  DOMPurify (strict tag/attr allowlist) — good. **Fixed (#4):** lesson **link URLs** were
  validated only by zod `.url()`, which in zod v4 still accepts `javascript:`/`data:`;
  a stored such URL would execute on click in the `<a href>`. Now the API rejects
  non-`http(s)` URLs on create, and the renderer additionally neutralizes any non-`http(s)`
  href (`safeHref`).

## 8. Dependencies — `pnpm audit`

Before: **1 high + 5 moderate**, all transitive (build/dev tooling + the GCS SDK), none on
a runtime request path. **Fixed** via `pnpm.overrides`:
- `serialize-javascript` → `>=7.0.5` — resolves the **HIGH** RCE (GHSA-qj8w-gfj5-8c6v) and
  the moderate DoS (transitive of `@ducanh2912/next-pwa > workbox-build`, build-time only).
- `postcss` → `>=8.5.10` — resolves the moderate stringify XSS (build-time CSS).

**Reported (remaining 3 moderate):**
- `esbuild <=0.24.2` via `drizzle-kit` (dev/migration tooling only; dev-server SSRF, not in
  the production bundle). Forcing 0.25 risks breaking drizzle-kit; recommend bumping when
  drizzle-kit updates.
- `uuid <11.1.1` via `@google-cloud/storage` (and its `gaxios`): the flaw needs a
  caller-supplied buffer; the SDK uses uuid for random ids only. uuid v11 is a breaking ESM
  change the SDK doesn't yet support — recommend updating when `@google-cloud/storage` does.

## 9–13. Reported (not changed — architectural / infra / behavior)

- **#9 Login throttling** — recommended (see §5).
- **#10 Last-superuser floor:** `PATCH /api/users/[id]/role` blocks self-demotion but
  there's no floor on the *total* number of superusers — the last/only other superuser could
  be demoted, locking out global-key & user management. Recommend a "≥1 superuser remains"
  guard. (Behavior-changing → reported.)
- **#11 Cookies:** NextAuth v5 JWT strategy with no explicit `cookies` block — relies on
  defaults (httpOnly, sameSite=lax, `secure`/`__Host-` only on https via `trustHost`).
  Recommend explicit hardened cookie config in `src/lib/auth.ts` for prod.
- **#12 `ipFromRequest`** trusts the first `x-forwarded-for` hop — only sound behind a
  trusted proxy that overwrites XFF (document the deployment requirement).
- **#13 `MOCK_EMAIL`** logs reset/verify links (raw token) to the console — dev/test only;
  ensure it is never enabled in production.

## Headers (Fixed #7 + recommended)

Added in `next.config.ts`: `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `X-DNS-Prefetch-Control: off`.
**Recommended (not applied):** a tuned **Content-Security-Policy** (needs testing against the
app's inline/runtime scripts, YouTube/PDF iframes) and **HSTS** — both best set at the
edge/proxy (nginx/Cloudflare) where TLS termination and a CSP report pipeline live.

---

### Net result of this pass
Fixed: shared-file authorization (#3), link-URL XSS (#4), parameterized vocab SQL (#5),
reset-password rate limit (#6), baseline headers (#7), and the HIGH + 2 moderate dependency
advisories (#8). Reported with rationale: login throttling, last-superuser floor, cookie
hardening, XFF trust, MOCK_EMAIL logging, CSP/HSTS, and 3 transitive dev/SDK advisories. No
existing control was weakened.
