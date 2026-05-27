# Language Learning Bot — Build Instructions for Claude Code

> **Read this entire document before starting.** This describes a full-stack web app to be built end-to-end in one session. Work through the sections in order. Stop and ask the user only if an instruction is genuinely ambiguous after re-reading; do not stop for confirmation on items already specified here.

---

## 0. Project overview

You are building **Language Learning Bot**, a multi-user web application that helps the user (and eventually others) study Thai (and potentially other languages later) using their own curated vocabulary, with an LLM-powered tutor and a spaced-repetition flashcard system.

### Scope of this build (v1 — what you build now)

In this session you will deliver a fully working web app with:

1. Project scaffolding (Next.js 15 App Router, TypeScript, Tailwind, shadcn/ui)
2. Self-hosted Postgres in Docker, with Drizzle ORM migrations
3. Email/password auth with **email verification (strict mode) and password reset**, using Auth.js v5 and Resend
4. Multi-user data model with all schema for vocab, lessons, tags, performance tracking, and per-user encrypted API keys
5. CSV import (Notion export format) for bulk vocab loading
6. Vocab CRUD: list, add single, edit, delete
7. Tag filter UI (two-column: lesson filter + theme filter, with AND/OR)
8. Settings page: provider+model dropdown (Google/Anthropic/OpenAI), API key entry (masked, click-to-reveal), encrypted at rest
9. PWA support (installable, online-only)
10. Smoke tests (Vitest unit + 1 Playwright E2E)
11. Local Docker Compose dev environment that mirrors production
12. Comprehensive README and an `ERROR_REPORT.md` capturing any issues encountered during the build
13. GitHub repo created and pushed
14. Deployment instructions for the user's GCP VM (you will document, the user will execute)

### Out of scope for this build (later)

These will be added in subsequent sessions. **Do not build these now**, but structure the code so they're easy to add:

- LLM-powered tutor chat
- Flashcard mode with FSRS spaced repetition
- Photo OCR for vocab extraction from textbook images
- Voice/avatar features
- `.apkg` import/export

---

## 1. Environment & paths

### User's local machine

- OS: WSL on Windows, working in VS Code
- Project path (create this directory, work inside it): `/home/thebuleganteng/01_Repos/06_personal_work/language-learning-bot`
- Node version: install/use Node 20 LTS (use `nvm` if available; otherwise check what's installed and request user install Node 20 if missing)
- Package manager: **pnpm** (faster, better monorepo support, smaller disk footprint). Install globally if not present: `npm install -g pnpm`

### Target GCP VM (for deployment docs only; do not deploy from this session)

- Path on VM: `/home/thebuleganteng/01_Repos/06_personal_work/vm-infrastructure/apps/language-learning-bot` (will be added as a submodule of the existing `vm-infrastructure` repo)
- Machine: e2-standard-2 (2 vCPU, 8GB RAM)
- Reverse proxy: nginx (in a Docker container, defined in `vm-infrastructure/docker-compose.yml`)
- SSL: Let's Encrypt for `kebayorantechnologies.com`, already configured
- App will be served at: `https://kebayorantechnologies.com/language-learning`
- Existing pattern to mirror: `/model-architecture/computer-vision` (a Next.js app served at a sub-path)

### GitHub

- Username: `TheBuleGanteng`
- New repo name: `language-learning-bot` (public)
- License: MIT

---

## 2. Tech stack (use exactly these)

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 15 (App Router) | TypeScript, React 19 |
| Styling | Tailwind CSS v4 + shadcn/ui | Use shadcn CLI to add components |
| Database | Postgres 16 (Docker) | Self-hosted, no managed service |
| ORM | Drizzle ORM | Type-safe, lightweight, good migrations |
| Auth | Auth.js v5 (`@auth/core`, `next-auth`) | Postgres adapter via Drizzle |
| Email | Resend (`resend` npm package) | For verification + password reset |
| Validation | Zod | For API input + env var parsing |
| Forms | React Hook Form + Zod resolver | Standard pairing |
| CSV parsing | Papaparse | Client-side parsing OK for files this size |
| Encryption | Node `crypto` (built-in) | AES-256-GCM for stored API keys |
| Testing | Vitest + Playwright | Vitest for units, Playwright for 1 E2E |
| Container | Docker + Docker Compose | Matches production exactly |
| PWA | `@ducanh2912/next-pwa` | Maintained fork of `next-pwa` |
| Linting | ESLint + Prettier | Use Next.js defaults |

**Do not** pull in any other major dependencies without good reason. If you find yourself wanting to add a library, prefer writing 20 lines of code instead unless the library is genuinely standard for the use case.

---

## 3. Pre-flight checks

Before writing any code, run these checks and **document what you find in `ERROR_REPORT.md` under "Pre-flight findings"**:

```bash
# Confirm Node and pnpm are available
node --version    # should be 20.x
pnpm --version    # should exist; if not, npm i -g pnpm

# Confirm Docker is available
docker --version
docker compose version

# Confirm git is configured
git config --global user.name
git config --global user.email

# Confirm the project directory does not already exist (we want a clean start)
ls /home/thebuleganteng/01_Repos/06_personal_work/language-learning-bot 2>/dev/null && echo "EXISTS — STOP" || echo "OK to create"

# Confirm we can reach GitHub
ssh -T git@github.com 2>&1 | head -5

# Confirm port 3000 (Next.js dev) and 5432 (Postgres) are free locally
ss -tlnp 2>/dev/null | grep -E ':3000|:5432' || echo "ports free"
```

If any check fails:
- Missing Node 20 / pnpm / Docker / git → **stop and ask the user to install**
- Project directory already exists → **stop and ask the user how to proceed** (do not overwrite)
- SSH to GitHub fails → **stop and ask the user to set up an SSH key**
- Ports occupied → **document in ERROR_REPORT.md and use alternative ports** (3001, 5433)

---

## 4. Directory layout

Create this structure:

```
language-learning-bot/
├── .env.example                       # template, committed
├── .env.local                         # actual local dev secrets, gitignored
├── .gitignore
├── .nvmrc                             # contains "20"
├── .prettierrc
├── .eslintrc.json
├── README.md
├── ERROR_REPORT.md                    # build issues log
├── LICENSE                            # MIT
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.mjs
├── components.json                    # shadcn config
├── drizzle.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── Dockerfile                         # production image
├── docker-compose.yml                 # local dev: app + postgres
├── docker-compose.prod.yml            # production-only overrides (used on GCP)
├── nginx/
│   └── language-learning.conf.snippet # to be merged into vm-infrastructure nginx config
├── scripts/
│   ├── seed.ts                        # seed dev data
│   ├── encrypt-test.ts                # verify encryption round-trips
│   └── import-notion-csv.ts           # CLI fallback for CSV import
├── public/
│   ├── manifest.webmanifest
│   ├── icon-192.png
│   ├── icon-512.png
│   └── favicon.ico
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                   # landing
│   │   ├── globals.css
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   ├── signup/page.tsx
│   │   │   ├── verify/page.tsx        # for ?token=...
│   │   │   ├── verify-sent/page.tsx   # "check your inbox"
│   │   │   ├── forgot-password/page.tsx
│   │   │   ├── reset-password/page.tsx
│   │   │   └── layout.tsx
│   │   ├── (app)/
│   │   │   ├── layout.tsx             # auth-protected
│   │   │   ├── vocab/
│   │   │   │   ├── page.tsx           # list + filter
│   │   │   │   ├── new/page.tsx
│   │   │   │   ├── [id]/page.tsx
│   │   │   │   └── import/page.tsx    # CSV upload
│   │   │   └── settings/
│   │   │       └── page.tsx
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   ├── auth/signup/route.ts
│   │   │   ├── auth/verify/route.ts
│   │   │   ├── auth/forgot-password/route.ts
│   │   │   ├── auth/reset-password/route.ts
│   │   │   ├── vocab/route.ts             # GET (list w/ filters), POST (create)
│   │   │   ├── vocab/[id]/route.ts        # GET, PATCH, DELETE
│   │   │   ├── vocab/import/route.ts      # POST (CSV)
│   │   │   ├── tags/route.ts              # GET (list user's tags)
│   │   │   ├── lessons/route.ts           # GET (list user's lessons)
│   │   │   └── settings/route.ts          # GET, PATCH
│   ├── components/
│   │   ├── ui/                            # shadcn primitives
│   │   ├── auth/
│   │   ├── vocab/
│   │   ├── settings/
│   │   └── layout/
│   ├── db/
│   │   ├── index.ts                       # drizzle client
│   │   ├── schema.ts                      # all tables
│   │   └── migrations/                    # generated by drizzle-kit
│   ├── lib/
│   │   ├── auth.ts                        # Auth.js config
│   │   ├── env.ts                         # validated env (Zod)
│   │   ├── crypto.ts                      # AES-GCM encrypt/decrypt for API keys
│   │   ├── email.ts                       # Resend client + templates
│   │   ├── models.ts                      # provider/model catalog
│   │   ├── csv-import.ts                  # Notion CSV parser
│   │   ├── tags.ts                        # tag categorization helpers
│   │   └── utils.ts
│   └── types/
│       └── index.ts
└── tests/
    ├── unit/
    │   ├── crypto.test.ts
    │   ├── csv-import.test.ts
    │   └── tags.test.ts
    └── e2e/
        └── auth-and-vocab.spec.ts
```

---

## 5. Database schema

Create this Drizzle schema in `src/db/schema.ts`. Use snake_case in the DB and let Drizzle handle the camelCase TS mapping.

### Tables

**users**
- `id` uuid PK, default `gen_random_uuid()`
- `email` text unique not null
- `password_hash` text not null (argon2id via `@node-rs/argon2`)
- `email_verified_at` timestamptz nullable
- `target_language` text not null default `'thai'`
- `native_language` text not null default `'english'`
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()

**verification_tokens**
- `id` uuid PK
- `user_id` uuid FK → users.id ON DELETE CASCADE
- `token_hash` text not null (sha256 of the token; never store raw)
- `purpose` text not null check in (`'email_verify'`, `'password_reset'`)
- `expires_at` timestamptz not null
- `used_at` timestamptz nullable
- `created_at` timestamptz not null default now()
- index on `(token_hash, purpose)`

**sessions** (Auth.js JWT strategy doesn't need a DB sessions table, but include it for the Auth.js Drizzle adapter — Auth.js docs)
- Use the canonical Auth.js Drizzle adapter schema for `accounts`, `sessions`, `verification_tokens` (rename the Auth.js verification_tokens table to `auth_verification_tokens` to avoid clash with ours above for password reset / email verify).
- **Reasoning**: we use Auth.js's session table for active login sessions, and our own `verification_tokens` table for email verification and password reset because we have full control over expiry, single-use, etc.

**user_settings**
- `user_id` uuid PK FK → users.id ON DELETE CASCADE
- `llm_provider` text not null default `'anthropic'` (one of `'anthropic'`, `'openai'`, `'google'`)
- `llm_model` text not null default `'claude-sonnet-4-6'` (string ID from the model catalog)
- `anthropic_api_key_encrypted` text nullable
- `openai_api_key_encrypted` text nullable
- `gemini_api_key_encrypted` text nullable
- `updated_at` timestamptz not null default now()

**lessons**
- `id` uuid PK
- `user_id` uuid FK → users.id ON DELETE CASCADE
- `name` text not null (e.g., "Lesson 3")
- `lesson_number` integer nullable (parsed from name when possible, for sorting)
- `topic` text nullable (free-form grammar/concept description)
- `date` date nullable
- `created_at` timestamptz not null default now()
- unique on `(user_id, name)`

**tags**
- `id` uuid PK
- `user_id` uuid FK → users.id ON DELETE CASCADE
- `name` text not null
- `color` text nullable
- `created_at` timestamptz not null default now()
- unique on `(user_id, name)`

**vocab_items**
- `id` uuid PK
- `user_id` uuid FK → users.id ON DELETE CASCADE
- `target_text` text not null (Thai script or romanization — whatever user has)
- `native_text` text not null (English)
- `transliteration` text nullable (used when target_text is in script and a romanization is also stored)
- `pos` text nullable (part of speech)
- `example_target` text nullable
- `example_native` text nullable
- `notes` text nullable
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()
- index on `(user_id, created_at desc)`

**vocab_tags** (M:N)
- `vocab_item_id` uuid FK → vocab_items.id ON DELETE CASCADE
- `tag_id` uuid FK → tags.id ON DELETE CASCADE
- PK `(vocab_item_id, tag_id)`

**vocab_lessons** (M:N — though usually 1:1 in practice)
- `vocab_item_id` uuid FK → vocab_items.id ON DELETE CASCADE
- `lesson_id` uuid FK → lessons.id ON DELETE CASCADE
- PK `(vocab_item_id, lesson_id)`

**item_performance** (placeholder for later — define schema now but don't write to it yet)
- `id` uuid PK
- `user_id` uuid FK → users.id ON DELETE CASCADE
- `vocab_item_id` uuid FK → vocab_items.id ON DELETE CASCADE
- `stability` real nullable (FSRS)
- `difficulty` real nullable (FSRS)
- `due_at` timestamptz nullable
- `last_review_at` timestamptz nullable
- `reps` integer not null default 0
- `lapses` integer not null default 0
- `state` text not null default `'new'` check in (`'new'`, `'learning'`, `'review'`, `'relearning'`)
- unique on `(user_id, vocab_item_id)`

### Drizzle config

`drizzle.config.ts`:

```ts
import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
  verbose: true,
  strict: true,
});
```

### Migration commands

Add to `package.json` scripts:
- `db:generate`: `drizzle-kit generate`
- `db:migrate`: `drizzle-kit migrate`
- `db:push`: `drizzle-kit push` (for fast iteration in dev only)
- `db:studio`: `drizzle-kit studio`

---

## 6. Environment variables

Create `.env.example` (committed) with these keys and **dummy** values. The real `.env.local` will be populated by the setup script.

```bash
# === Database ===
DATABASE_URL=postgresql://lang:devpassword@localhost:5432/language_learning

# === Auth ===
# Generate with: openssl rand -base64 32
AUTH_SECRET=replace-with-32-byte-base64
AUTH_TRUST_HOST=true
NEXTAUTH_URL=http://localhost:3000

# === Encryption (for API keys at rest) ===
# Generate with: openssl rand -base64 32
APP_ENCRYPTION_KEY=replace-with-32-byte-base64

# === Resend (email) ===
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxx
EMAIL_FROM="Language Learning Bot <noreply@kebayorantechnologies.com>"
# For local dev, you can override this to "onboarding@resend.dev" but it
# will only send to your own verified Resend account email.

# === App ===
NODE_ENV=development
APP_URL=http://localhost:3000
# In production: APP_URL=https://kebayorantechnologies.com/language-learning

# === LLM API keys (NOT used by app directly — users enter their own in UI) ===
# These env vars exist for *fallback* / dev testing only. Production uses
# per-user encrypted keys from the DB.
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=
```

### Env validation

`src/lib/env.ts` — parse `process.env` with Zod at boot. Fail loudly on missing required vars in production; in dev, warn and use sensible defaults where possible.

```ts
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  APP_ENCRYPTION_KEY: z.string().min(32),
  RESEND_API_KEY: z.string().startsWith('re_'),
  EMAIL_FROM: z.string().min(1),
  APP_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
});

export const env = schema.parse(process.env);
```

Note: the bracketed env var names (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`) match what the user specified. They are **not** used by the app at runtime to call LLMs — they're only for optional fallback during testing. Production LLM calls use per-user encrypted keys.

---

## 7. Encryption for stored API keys

`src/lib/crypto.ts` — implement AES-256-GCM. Use the `APP_ENCRYPTION_KEY` from env (base64-decoded to 32 bytes).

```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from './env';

const KEY = Buffer.from(env.APP_ENCRYPTION_KEY, 'base64');
if (KEY.length !== 32) throw new Error('APP_ENCRYPTION_KEY must decode to 32 bytes');

const IV_LEN = 12;
const TAG_LEN = 16;

export function encryptString(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: base64(iv | tag | ciphertext)
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptString(payload: string): string {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

export function maskKey(key: string | null): string {
  if (!key) return '';
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 4)}${'•'.repeat(Math.max(4, key.length - 8))}${key.slice(-4)}`;
}
```

**Important**: when the settings page returns the stored key to the UI, it returns the masked version by default. Only return the decrypted plaintext when the user clicks "Reveal" (the GET endpoint accepts a `?reveal=true` query param which requires the user to be authenticated as the owner; do not log decrypted keys).

Test this round-trip in `tests/unit/crypto.test.ts`.

---

## 8. Auth implementation

Use **Auth.js v5** (`next-auth@beta` as of the cutoff — verify current stable on install) with the Drizzle adapter.

### Sign-up flow (strict mode)

1. User submits email + password on `/signup`
2. POST `/api/auth/signup`:
   - Validate with Zod (email format, password ≥ 8 chars, has at least one letter and one number)
   - Check email not already used
   - Hash password with argon2id (`@node-rs/argon2`, default params)
   - Insert into `users` with `email_verified_at = null`
   - Generate a 32-byte random token, store its sha256 in `verification_tokens` with `purpose='email_verify'`, `expires_at = now() + 24h`
   - Send verification email via Resend with link `${APP_URL}/verify?token=<raw_token>`
   - Return success (no auto-login)
3. Redirect to `/verify-sent` page that says "Check your inbox at <email>. Didn't receive it? [Resend]"

### Verification

1. User clicks link → loads `/verify?token=...`
2. Client POSTs `/api/auth/verify` with token
3. Server hashes token, looks up unexpired/unused row, marks `used_at`, sets `users.email_verified_at = now()`
4. Redirect to `/login` with success flash

### Login

1. Auth.js Credentials provider
2. **Reject login if `email_verified_at` is null** (return generic "Invalid credentials or email not verified" — don't leak which)
3. On success, issue JWT session

### Password reset

1. `/forgot-password` → user enters email → POST `/api/auth/forgot-password`
2. **Always return success** even if email doesn't exist (don't leak account existence)
3. If account exists and verified: generate token, store hashed in `verification_tokens` with `purpose='password_reset'`, `expires_at = now() + 1h`, send email
4. User clicks link → `/reset-password?token=...` → enter new password → POST `/api/auth/reset-password`
5. Validate token, update password_hash, mark token used, **invalidate all existing sessions** for that user (delete from Auth.js sessions table)
6. Redirect to `/login`

### Rate limiting

For v1, do a simple in-memory rate limit on `/api/auth/signup`, `/api/auth/forgot-password`, and `/api/auth/verify`: max 5 requests per IP per 15 min. Use a Map + setInterval cleanup; document in README that this resets on app restart and would want Redis for production scale.

### Protected routes

`src/app/(app)/layout.tsx` server-component: call `auth()` from Auth.js; if no session, redirect to `/login`. Also gate the settings, vocab, etc. routes.

---

## 9. Email templates (Resend)

`src/lib/email.ts` — minimal HTML templates, no template engine needed. Two templates:

**Verification email**:
- Subject: "Verify your email for Language Learning Bot"
- Body: Short, plain. Includes the link, fallback URL text, expiry note.

**Password reset email**:
- Subject: "Reset your Language Learning Bot password"
- Body: Same style. 1h expiry note.

Send via Resend SDK:

```ts
import { Resend } from 'resend';
import { env } from './env';

const resend = new Resend(env.RESEND_API_KEY);

export async function sendVerificationEmail(to: string, link: string) {
  await resend.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject: 'Verify your email for Language Learning Bot',
    html: `<p>Click to verify: <a href="${link}">${link}</a></p><p>Expires in 24 hours.</p>`,
  });
}

export async function sendPasswordResetEmail(to: string, link: string) {
  await resend.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject: 'Reset your Language Learning Bot password',
    html: `<p>Click to reset: <a href="${link}">${link}</a></p><p>Expires in 1 hour. If you didn't request this, ignore.</p>`,
  });
}
```

Catch send errors; log them; do NOT expose error details to the user (return generic success).

---

## 10. Model catalog

`src/lib/models.ts` — hardcoded list, as of May 2026. **Pin these IDs** — UI dropdowns read from this.

```ts
export const PROVIDERS = ['anthropic', 'openai', 'google'] as const;
export type Provider = (typeof PROVIDERS)[number];

export const MODELS: Record<Provider, Array<{ id: string; label: string; isDefault?: boolean }>> = {
  anthropic: [
    { id: 'claude-opus-4-7', label: 'Claude Opus 4.7 (highest quality)' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (recommended)', isDefault: true },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (fastest, cheapest)' },
  ],
  openai: [
    { id: 'gpt-5.5', label: 'GPT-5.5 (highest quality)' },
    { id: 'gpt-5.4', label: 'GPT-5.4 (balanced)' },
    { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini (recommended)', isDefault: true },
    { id: 'gpt-5.4-nano', label: 'GPT-5.4 nano (cheapest)' },
  ],
  google: [
    { id: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro (highest quality)' },
    { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash (recommended)', isDefault: true },
    { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite (cheapest)' },
  ],
};

export function defaultModelFor(p: Provider): string {
  return MODELS[p].find(m => m.isDefault)!.id;
}
```

In the README, add a note: "Model lineup is hardcoded as of May 2026. Verify currency at the relevant provider's pricing page before deploying."

---

## 11. CSV import (Notion export format)

`src/lib/csv-import.ts` — parse the Notion CSV format. Headers are `Thai,English,Lessons,Tags`. See the test fixture (created below).

### Per-row processing

1. `Thai` → `target_text`
2. `English` → `native_text`
3. `Lessons` → strip the ` (https://...)` suffix to get the lesson name. May be empty. If present, find-or-create lesson row.
4. `Tags` → split on `,` (handling quoted CSV cells via papaparse), trim each. **Drop any tag matching `/^lesson_\d+$/`** (those are redundant with the Lessons column under the new normalized model). Find-or-create the remaining tag rows.
5. Insert vocab_item, then insert vocab_tags and vocab_lessons join rows.
6. Skip rows with empty `Thai` or `English` (log to import result).
7. Within one upload, dedupe by `(target_text, native_text)` to handle accidental duplicate rows in the CSV.
8. Across the existing DB, check for existing `(user_id, target_text, native_text)` match. If exact match exists, **skip** and report as duplicate. Otherwise insert. (We're not merging tags into existing items in v1 — keeps semantics clear.)

### API endpoint

POST `/api/vocab/import` — accepts `multipart/form-data` with a single `file` field. Returns JSON summary:
```json
{
  "inserted": 1850,
  "skippedDuplicatesInFile": 0,
  "skippedAlreadyInDb": 5,
  "skippedEmpty": 0,
  "lessonsCreated": 32,
  "tagsCreated": 51,
  "errors": []
}
```

Use a DB transaction so a failed import doesn't half-load. Process in batches of 500 to avoid timeout.

### UI

`/vocab/import` page: drag-drop zone, preview of first 10 rows after parsing, "Import N rows" button, progress, then summary screen.

### CLI fallback

`scripts/import-notion-csv.ts` — run via `pnpm tsx scripts/import-notion-csv.ts <user_email> <csv_path>`. Useful for seeding the user's own data directly without the UI.

---

## 12. Vocab UI

### List page `/vocab`

Layout:
- Top bar: "Add vocab" button (→ `/vocab/new`), "Import CSV" button (→ `/vocab/import`)
- Left rail (or top on mobile): Two filter columns
  - **Lessons** column: list of user's lessons (from `lessons` table), sorted by `lesson_number` ASC then name. Each is a checkbox.
  - **Themes** column: list of user's tags (from `tags` table), sorted by name. Each is a checkbox.
  - Above both: a toggle for "Match ALL selected (AND)" vs "Match ANY selected (OR)"
  - "Clear filters" button
  - Count badge: "Showing X of Y items"
- Main pane: table or card list of vocab items. Columns: target_text, native_text, lessons (badges), tags (badges), edit/delete.
- Pagination: 50 per page; URL param `?page=2`
- Search box: filters by substring match on `target_text` OR `native_text` (case insensitive)

### Filter semantics

When the user has lessons selected AND tags selected:
- **AND mode**: items must match (one of selected lessons) AND (one of selected tags)
- **OR mode**: items must match (one of selected lessons) OR (one of selected tags)

Within a single column (just lessons, or just tags), behavior is always OR — selecting two lessons shows items in either.

### Add/edit forms

Standard fields. Lessons: combobox where user can pick an existing lesson or type a new name to create one. Tags: multi-select combobox, same find-or-create behavior.

### Delete

Soft confirm with a shadcn `AlertDialog`. Hard delete from DB (no soft-delete in v1).

---

## 13. Settings page `/settings`

Single page, sections:

### Profile
- Email (read-only)
- Target language (dropdown; for v1 only Thai is offered, but the dropdown exists)
- Native language (dropdown; for v1 only English)

### LLM
- Provider dropdown: Anthropic, OpenAI, Google
- Model dropdown: populated from `MODELS[selectedProvider]`, default selected
- Changing provider auto-selects that provider's default model
- "Save" button

### API keys
Three rows, one per provider:
- Label: "Anthropic API key" etc.
- Input field, type=password by default, with a `Eye` icon button to toggle to type=text
- Placeholder if no key set: "Not configured"
- If a key IS set, the GET endpoint returns `maskKey(decrypted)`; user can click "Reveal" to fetch the plaintext (separate API call with `?reveal=true`) and momentarily show it
- "Save" button per row
- "Remove" button per row (sets the column to null)

### Danger zone
- "Sign out everywhere" — deletes all this user's Auth.js sessions
- "Delete account" — modal confirmation typing "DELETE" → DELETEs user row (cascade handles everything)

---

## 14. PWA setup

Use `@ducanh2912/next-pwa`. Configure in `next.config.ts`. Generate `public/manifest.webmanifest`:

```json
{
  "name": "Language Learning Bot",
  "short_name": "LangBot",
  "description": "Personalized language learning with your own vocab and an AI tutor",
  "start_url": "/language-learning",
  "scope": "/language-learning",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#0ea5e9",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

For icons, generate placeholder PNGs (solid color with letter "L") at 192x192 and 512x512 using ImageMagick if available, otherwise commit two checkered placeholder PNGs and note in the README that the user should replace them.

**Important**: PWA in dev mode is annoying (aggressive caching). Disable PWA in development:

```ts
import withPWA from '@ducanh2912/next-pwa';
const config = withPWA({ dest: 'public', disable: process.env.NODE_ENV === 'development' })({
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  // ...
});
```

---

## 15. Next.js basePath for sub-path deployment

Critical. The app must work at `/language-learning` on the server, but at `/` in local dev (for simplicity).

`next.config.ts`:

```ts
import type { NextConfig } from 'next';
import withPWA from '@ducanh2912/next-pwa';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const config: NextConfig = {
  basePath: basePath || undefined,
  output: 'standalone',
  experimental: {
    serverActions: { bodySizeLimit: '10mb' },  // CSV uploads
  },
};

export default withPWA({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
})(config);
```

In production deployment, set `NEXT_PUBLIC_BASE_PATH=/language-learning` and `APP_URL=https://kebayorantechnologies.com/language-learning`. All internal links, fetch calls, and Auth.js URLs must be basePath-aware. Use Next.js's `Link` component everywhere (it handles basePath automatically) and for fetches use relative paths starting with the basePath, or construct from `APP_URL`.

Email links (verification, reset) must use `APP_URL` so they always work from external clicks.

---

## 16. Docker setup

### Local development `docker-compose.yml`

```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: lang
      POSTGRES_PASSWORD: devpassword
      POSTGRES_DB: language_learning
    ports:
      - "5432:5432"
    volumes:
      - lang_pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U lang -d language_learning"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  lang_pg_data:
```

The app itself runs via `pnpm dev` outside Docker in local development (faster iteration).

### Production `Dockerfile` (multi-stage)

```Dockerfile
# === deps ===
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

# === build ===
FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_BASE_PATH=/language-learning
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
RUN corepack enable && pnpm build

# === run ===
FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build /app/src/db/migrations ./src/db/migrations
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
```

### Production compose snippet `docker-compose.prod.yml`

This is **documentation only** — the actual production deployment is via the user's existing `vm-infrastructure/docker-compose.yml`. Provide this as a snippet to be merged:

```yaml
# To be merged into /home/thebuleganteng/01_Repos/06_personal_work/vm-infrastructure/docker-compose.yml
# Add these services and update the nginx `depends_on`.

  language-learning-postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: lang
      POSTGRES_PASSWORD_FILE: /run/secrets/lang_pg_password
      POSTGRES_DB: language_learning
    volumes:
      - lang_pg_data:/var/lib/postgresql/data
    secrets:
      - lang_pg_password
    # No ports exposed to host — only available on the docker network

  language-learning-bot:
    build:
      context: ./apps/language-learning-bot
      dockerfile: Dockerfile
      args:
        - NEXT_PUBLIC_BASE_PATH=/language-learning
    restart: unless-stopped
    depends_on:
      - language-learning-postgres
    volumes:
      - /home/matt/secrets/language-learning-bot/.env:/app/.env
    # Or, if the user prefers, list env vars directly here

volumes:
  lang_pg_data:

secrets:
  lang_pg_password:
    file: /home/matt/secrets/language-learning-bot/pg_password
```

And update the nginx `depends_on` to include `language-learning-bot`.

---

## 17. nginx config snippet

Create `nginx/language-learning.conf.snippet` for the user to paste into their nginx config. Mirror the pattern from the existing `/model-architecture/computer-vision` location block:

```nginx
    # Language Learning Bot - Next.js app at /language-learning
    location /language-learning {
        proxy_pass http://language-learning-bot:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
```

In the README deployment section, instruct the user where exactly in `default.conf` this goes.

---

## 18. Tests

### Unit (Vitest)

`tests/unit/crypto.test.ts`:
- Round-trip: encrypt("hello") then decrypt → "hello"
- Different inputs produce different ciphertexts (IV randomness)
- maskKey works for short, normal, very short, empty inputs

`tests/unit/tags.test.ts`:
- `isLessonTag('lesson_1') === true`
- `isLessonTag('lesson_99') === true`
- `isLessonTag('food') === false`
- `isLessonTag('lesson_summary') === false` (only numeric suffix)
- `parseLessonNameNumber('Lesson 3') === 3`
- `parseLessonNameNumber('Lesson 34') === 34`
- `parseLessonNameNumber('Final exam') === null`

`tests/unit/csv-import.test.ts`:
- Use a 5-row fixture CSV (create `tests/fixtures/sample-notion-export.csv`)
- Verify lessons-suffix stripping
- Verify lesson_X tag dropping
- Verify dedup within file
- (Mock the DB or use a separate in-memory layer)

### E2E (Playwright)

`tests/e2e/auth-and-vocab.spec.ts`:

Single test that:
1. Starts the dev server (handled by Playwright config `webServer`)
2. Goes to `/signup`, creates account `test+e2e@example.com` / `Password1`
3. Reads the verification token directly from the DB (test helper) — bypasses Resend
4. Visits the verification link
5. Logs in
6. Goes to `/vocab/import`, uploads `tests/fixtures/sample-notion-export.csv`
7. Verifies import summary shows expected counts
8. Goes to `/vocab`, verifies items appear
9. Selects a lesson filter, verifies count updates correctly
10. Goes to `/settings`, sets Anthropic provider, enters fake API key `sk-test123`, saves
11. Reloads, verifies the key is shown masked
12. Clicks reveal, verifies the plaintext is `sk-test123`

For Playwright config: use `webServer: { command: 'pnpm dev', port: 3000 }` and a `test:e2e` script. Use a separate test DB (`language_learning_test`) — set up via Docker compose `postgres` with a second db, or use a single DB and reset before each test.

---

## 19. Build sequence

Work in this order. After each major step, run a sanity check.

### Step 1 — Scaffold (45 min)
1. Run pre-flight checks (Section 3), write findings to `ERROR_REPORT.md`
2. `mkdir -p /home/thebuleganteng/01_Repos/06_personal_work/language-learning-bot && cd $_`
3. `pnpm create next-app@latest .` with: TypeScript yes, ESLint yes, Tailwind yes, App Router yes, src/ yes, Turbopack yes, default import alias
4. Initialize git: `git init && git add -A && git commit -m "chore: initial Next.js scaffold"`
5. Add `.nvmrc` with `20`, `.prettierrc` with sensible defaults
6. `pnpm dlx shadcn@latest init` (defaults: New York style, Slate base color, CSS vars yes)
7. Add core shadcn components: `pnpm dlx shadcn@latest add button input label form card dialog alert-dialog dropdown-menu select badge table checkbox toast` (use whatever the current command is — verify before running)
8. Sanity: `pnpm dev`, hit http://localhost:3000, see default page. **Commit.**

### Step 2 — Database (45 min)
1. Add `docker-compose.yml` (local Postgres only)
2. `docker compose up -d postgres` — verify with `docker compose ps`
3. `pnpm add drizzle-orm pg && pnpm add -D drizzle-kit @types/pg tsx`
4. Write `src/db/schema.ts` per Section 5
5. Write `src/db/index.ts` exporting a Drizzle client
6. Write `drizzle.config.ts`
7. Create `.env.local` with `DATABASE_URL=postgresql://lang:devpassword@localhost:5432/language_learning` and a generated `APP_ENCRYPTION_KEY` (use `openssl rand -base64 32`). Other env vars: stub for now.
8. `pnpm db:generate` then `pnpm db:migrate`
9. Sanity: `pnpm db:studio` — see all tables. **Commit.**

### Step 3 — Encryption + env validation (30 min)
1. `pnpm add zod`
2. Write `src/lib/env.ts` (Section 6)
3. Write `src/lib/crypto.ts` (Section 7)
4. Write `tests/unit/crypto.test.ts`
5. `pnpm add -D vitest @vitest/ui` + add `vitest.config.ts` + `test` script
6. `pnpm test` — verify crypto tests pass. **Commit.**

### Step 4 — Auth.js (90 min)
This is the most error-prone step. Take it carefully.

1. `pnpm add next-auth@beta @auth/drizzle-adapter @node-rs/argon2 resend`
2. Generate `AUTH_SECRET` via `openssl rand -base64 32`, add to `.env.local`
3. Sign up at resend.com (the user will do this manually — instruct in README; for the build, the user must provide a key OR stub the email function to log to console in dev). **For the build, implement a `MOCK_EMAIL=1` env flag that, when set, logs emails to console instead of calling Resend.** This lets you complete and test the build before the user has set up Resend.
4. Set up Auth.js Drizzle adapter following the v5 docs (this changes — read current docs)
5. Implement signup, verify, login, forgot-password, reset-password as per Section 8
6. Sanity: manually walk through signup → console-log verify link → click → login. **Commit.**

### Step 5 — Settings + model catalog (30 min)
1. Write `src/lib/models.ts` (Section 10)
2. Build `/settings` page (Section 13)
3. API routes for GET/PATCH `/api/settings`
4. Sanity: change provider/model, save, reload, persists. Enter fake API key, save, reload, shows masked. **Commit.**

### Step 6 — CSV import (60 min)
1. `pnpm add papaparse && pnpm add -D @types/papaparse`
2. Write `src/lib/csv-import.ts` (Section 11)
3. Write `tests/unit/csv-import.test.ts`
4. Create `tests/fixtures/sample-notion-export.csv` — 5 representative rows from the user's real export, including: one with no tags, one with multiple tags, one with lesson_X tag (must be dropped), one with a multi-word lesson name, one duplicate
5. API route `/api/vocab/import`
6. UI page `/vocab/import`
7. CLI fallback `scripts/import-notion-csv.ts`
8. Sanity: import the 5-row fixture, then **import the user's real 1,907-row file** (assume they'll place it at `~/notion-export.csv` and use the CLI). Verify counts. **Commit.**

### Step 7 — Vocab CRUD + filters (90 min)
1. List page with filters (Section 12)
2. Add/edit/delete pages and APIs
3. Verify filters work with real data
4. **Commit.**

### Step 8 — PWA + basePath (30 min)
1. Install `@ducanh2912/next-pwa`
2. Configure as in Section 14 and 15
3. Generate placeholder icons
4. Test in production build: `pnpm build && pnpm start`, verify manifest serves
5. **Commit.**

### Step 9 — Playwright E2E (45 min)
1. `pnpm dlx playwright install chromium`
2. `pnpm add -D @playwright/test`
3. `playwright.config.ts`
4. Write the single E2E test (Section 18)
5. Run it: `pnpm test:e2e`. Iterate until green.
6. **Commit.**

### Step 10 — Docs + GitHub (45 min)
1. Write `README.md` (see Section 20 below for required sections)
2. Update `ERROR_REPORT.md` with all issues hit during build and their resolutions
3. `gh repo create TheBuleGanteng/language-learning-bot --public --source=. --remote=origin --description "Self-hosted multi-user language learning app with LLM tutor"`
   - If `gh` not installed: instruct user how to create the repo manually on github.com, then `git remote add origin git@github.com:TheBuleGanteng/language-learning-bot.git`
4. `git push -u origin main`
5. Verify the repo is live on github.com

### Step 11 — Final smoke check
Run all the following on the local machine, all should pass:
- `pnpm lint` → 0 errors
- `pnpm test` → all green
- `pnpm test:e2e` → green
- `pnpm build` → success
- `docker compose up -d postgres && pnpm dev` → app loads, login works

If anything fails: fix, then re-run. If after 3 attempts something is still broken, document in `ERROR_REPORT.md` and continue (don't get stuck on one issue forever).

---

## 20. README.md — required contents

The README must contain these sections, in this order:

1. **Title + one-paragraph description**
2. **Features (v1)** — checklist of what works
3. **Roadmap** — what's planned next (tutor, flashcards, OCR)
4. **Tech stack** — bullet list
5. **Prerequisites** — Node 20, pnpm, Docker, a Resend account, etc.
6. **Local development setup** — step-by-step:
   - clone
   - `pnpm install`
   - copy `.env.example` to `.env.local`, generate secrets, fill in Resend key (or set `MOCK_EMAIL=1`)
   - `docker compose up -d postgres`
   - `pnpm db:migrate`
   - `pnpm dev`
7. **Importing your Notion vocab** — explain the CSV export from Notion, both the UI and CLI methods
8. **Resend + DNS setup** — see Section 21 below — copy verbatim into README
9. **Deployment to GCP VM** — see Section 22 below — copy verbatim into README
10. **API key configuration in the UI** — note that keys are encrypted with AES-256-GCM and stored per-user
11. **Testing** — `pnpm test`, `pnpm test:e2e`
12. **Tag conventions** — explain that lessons are normalized into the lessons table; thematic tags go into tags table
13. **Model catalog freshness** — note the May 2026 model list and where to update it
14. **Known limitations** — listed honestly
15. **License** — MIT

---

## 21. Resend + DNS setup instructions (verbatim for README)

Include this section in the README **verbatim** (the user will follow it after the build):

```markdown
## Resend + DNS setup

This app sends transactional email (verification, password reset) from
`noreply@kebayorantechnologies.com` via Resend. You already have a working
email setup at `info@kebayorantechnologies.com` (Google Workspace), but
Resend needs its own DNS records for deliverability — it does not conflict
with your existing Google MX records.

### One-time setup

1. **Create a Resend account** at https://resend.com. Free tier (3,000 emails/month,
   100/day) is plenty.

2. **Add your domain** in Resend dashboard:
   - Domains → Add Domain → enter `kebayorantechnologies.com`
   - Resend shows you 3-4 DNS records to add: one MX (for receiving bounces),
     one or two TXT (SPF), and one TXT (DKIM, named like `resend._domainkey`).

3. **Important — keep your existing Google MX records.** Resend's "MX" record
   is on a subdomain like `send.kebayorantechnologies.com`, NOT on the root.
   This means your `info@` Gmail keeps working untouched. If Resend asks
   for a root-level MX record, choose the "subdomain" option instead.

4. **Add the records in your DNS provider** (wherever `kebayorantechnologies.com`
   is registered — likely the same place you set up the existing email).
   Common providers: Google Domains/Squarespace, Cloudflare, Namecheap.

5. **Click "Verify" in Resend** — propagation usually takes 5-30 minutes.
   You can re-click until all records show green.

6. **Update your existing SPF record** to include Resend. Find your existing
   TXT record that starts with `v=spf1`. It probably includes
   `include:_spf.google.com`. Edit it to also include `include:_spf.resend.com`,
   so it looks like:
   ```
   v=spf1 include:_spf.google.com include:_spf.resend.com ~all
   ```
   **Important**: a domain may only have ONE SPF record. If you have two
   `v=spf1` records, merge them.

7. **Create an API key** in Resend (API Keys → Create). Copy the key
   starting with `re_`.

8. **Put the key in your `.env.local`** (local) or production secrets file:
   ```
   RESEND_API_KEY=re_...
   EMAIL_FROM="Language Learning Bot <noreply@kebayorantechnologies.com>"
   ```

### Testing email delivery

Without setting up DNS, you can test using Resend's sandbox sender:
```
EMAIL_FROM="Language Learning Bot <onboarding@resend.dev>"
```
This works immediately but **only sends to the email address you signed up
to Resend with**. Useful for verifying the code path before DNS is configured.

For local development without any external sending, set `MOCK_EMAIL=1` in
your `.env.local`. Emails are logged to the console with the verification
link printed in full — copy-paste it into your browser.
```

---

## 22. GCP VM deployment instructions (verbatim for README)

Include this section in the README **verbatim**:

```markdown
## Deployment to GCP VM (kebayorantechnologies.com/language-learning)

These steps assume you have the `vm-infrastructure` repo already on your VM
at `/home/thebuleganteng/01_Repos/06_personal_work/vm-infrastructure` with
nginx + your other apps running via Docker Compose.

### 1. Add this repo as a submodule

On your VM:
```bash
cd /home/thebuleganteng/01_Repos/06_personal_work/vm-infrastructure
git submodule add git@github.com:TheBuleGanteng/language-learning-bot.git apps/language-learning-bot
git commit -m "feat: add language-learning-bot submodule"
```

### 2. Create the secrets directory

```bash
sudo mkdir -p /home/matt/secrets/language-learning-bot
sudo chown matt:matt /home/matt/secrets/language-learning-bot
```

Create `/home/matt/secrets/language-learning-bot/.env`:
```bash
DATABASE_URL=postgresql://lang:CHOOSE_A_STRONG_PASSWORD@language-learning-postgres:5432/language_learning
AUTH_SECRET=GENERATE_WITH_openssl_rand_base64_32
AUTH_TRUST_HOST=true
NEXTAUTH_URL=https://kebayorantechnologies.com/language-learning
APP_ENCRYPTION_KEY=GENERATE_WITH_openssl_rand_base64_32
RESEND_API_KEY=re_your_real_key
EMAIL_FROM="Language Learning Bot <noreply@kebayorantechnologies.com>"
APP_URL=https://kebayorantechnologies.com/language-learning
NODE_ENV=production
NEXT_PUBLIC_BASE_PATH=/language-learning
```

Create the Postgres password file (used as a Docker secret):
```bash
echo -n "SAME_STRONG_PASSWORD_AS_ABOVE" > /home/matt/secrets/language-learning-bot/pg_password
chmod 600 /home/matt/secrets/language-learning-bot/pg_password
chmod 600 /home/matt/secrets/language-learning-bot/.env
```

### 3. Update docker-compose.yml

Edit `/home/thebuleganteng/01_Repos/06_personal_work/vm-infrastructure/docker-compose.yml`.
Add the new services (snippet provided in `apps/language-learning-bot/docker-compose.prod.yml`).

Specifically:
1. Add the `language-learning-postgres` service
2. Add the `language-learning-bot` service
3. Add `language-learning-bot` to the nginx service's `depends_on` list
4. Add the `lang_pg_data` volume to the top-level volumes
5. Add the `lang_pg_password` secret to the top-level secrets

### 4. Update nginx config

Edit `/home/thebuleganteng/01_Repos/06_personal_work/vm-infrastructure/nginx/conf.d/default.conf`.

Inside the `server { ... server_name kebayorantechnologies.com www.kebayorantechnologies.com; ... }` block (the HTTPS one with the SSL certs), add the location block from
`apps/language-learning-bot/nginx/language-learning.conf.snippet`.

A good place is right after the existing `/model-architecture/computer-vision` block,
before the catch-all root location.

### 5. Build and start

```bash
cd /home/thebuleganteng/01_Repos/06_personal_work/vm-infrastructure
docker compose build language-learning-bot
docker compose up -d language-learning-postgres
# Wait ~10 seconds for postgres to be ready, then:
docker compose run --rm language-learning-bot node -e "require('child_process').execSync('pnpm db:migrate', {stdio:'inherit'})"
# (Or shell into the container and run pnpm db:migrate manually.)
docker compose up -d language-learning-bot
docker compose restart nginx
```

### 6. Verify

```bash
curl -I https://kebayorantechnologies.com/language-learning
# expect HTTP/2 200
```

Visit the URL in your browser. Sign up; you should receive a verification
email. Click it, log in, and start importing vocab.

### Updating later

```bash
cd /home/thebuleganteng/01_Repos/06_personal_work/vm-infrastructure/apps/language-learning-bot
git pull origin main
cd ../..
docker compose build language-learning-bot
docker compose up -d language-learning-bot
```

### Backups

Add this to your existing backup cron, or as a new one:
```bash
0 3 * * * docker exec language-learning-postgres pg_dump -U lang language_learning | gzip > /home/matt/backups/language-learning-$(date +\%Y\%m\%d).sql.gz && find /home/matt/backups -name "language-learning-*.sql.gz" -mtime +30 -delete
```
```

---

## 23. ERROR_REPORT.md — what goes here

Create this file at the project root. Use this template:

```markdown
# Build Error Report

This document logs issues encountered during the initial build, their root cause,
and how they were resolved. Maintained going forward as a running log of
non-obvious problems.

## Pre-flight findings

(populate from Section 3 checks)

## Build issues

### [YYYY-MM-DD] <short title>

**Context**: what step

**Error**:
```
exact error message
```

**Root cause**: <explanation>

**Resolution**: <what fixed it>

**Lessons / Watch-outs**: <anything future-you should remember>

---

## Known issues / deferred

- Item 1: description, why deferred, suggested fix when revisited.
```

Be thorough but concise. If you hit a tricky issue (Auth.js v5 has been changing rapidly, basePath has known gotchas with Auth.js, PWA service workers can cache stale auth state, etc.), capture it here so future-you doesn't repeat the debugging.

---

## 24. Final acceptance criteria

The build is "done" when **all** of the following are true:

- [ ] `pnpm dev` starts cleanly with no errors in console
- [ ] http://localhost:3000 loads the landing page
- [ ] Signing up with a new email triggers an email (real or mocked) with a working verification link
- [ ] Clicking the link verifies, redirects to login
- [ ] Logging in lands on the vocab page
- [ ] Importing the user's 1,907-row Notion CSV succeeds and shows a summary
- [ ] The vocab list shows the imported items
- [ ] Filtering by a lesson + a tag returns expected results in both AND and OR modes
- [ ] Adding a new vocab item manually works
- [ ] Editing and deleting work
- [ ] Settings page lets the user pick provider+model and save an API key (masked, reveal works)
- [ ] Forgot password flow works end-to-end
- [ ] `pnpm lint` passes with 0 errors
- [ ] `pnpm test` passes (all unit tests)
- [ ] `pnpm test:e2e` passes
- [ ] `pnpm build` succeeds without warnings (or only with warnings explicitly documented in ERROR_REPORT.md)
- [ ] GitHub repo `TheBuleGanteng/language-learning-bot` exists, public, with all code pushed to `main`
- [ ] README.md, ERROR_REPORT.md, LICENSE all present and complete
- [ ] PWA manifest serves correctly in production build
- [ ] `docker-compose.yml` (local) works; `Dockerfile` (prod) builds successfully

When all boxes are checked, write a final summary in the chat:
- What was built
- What failed during build (if anything) and how it was resolved
- What the user needs to do next (Resend DNS setup, GCP deployment, importing their CSV)
- Any decisions you made that diverged from this spec, and why

---

## 25. Defaults you may apply silently

These are decisions I'm comfortable having you make without checking back:

- shadcn theme colors / specific neutral palette
- Exact wording of error messages and email copy (be professional, brief)
- Specific Zod validation error messages
- Exact pagination size if it differs from 50 by a reasonable amount
- Loading states / spinners
- Toast notification placement
- Specific Tailwind utility classes
- Whether to use Server Components vs Client Components for any given screen (use the obvious choice — RSC for data fetching, Client for interactive forms)
- Folder substructure under `components/`
- Specific Auth.js version (use latest stable v5 at install time)

## 26. Things to check back on (do not silently assume)

- If `pnpm create next-app` prompts for choices not listed in Section 19 step 1 (versions move) — make the obviously-sensible choice but log it in ERROR_REPORT.md
- If a major dependency has a breaking change that affects the approach here (e.g., Auth.js v5 API changed again) — adapt and document
- If you cannot figure out something after 3 attempts — document, skip, continue. Do not get stuck

---

## End of spec

Start with Section 3 (pre-flight). Work through Section 19 step by step. Update ERROR_REPORT.md as you go. Finish with the Section 24 acceptance check.

Good luck.