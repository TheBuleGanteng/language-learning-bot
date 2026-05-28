# Language Learning Bot

Self-hosted, multi-user web app for studying Thai (and other languages later)
with your own curated vocab, an LLM-powered tutor (coming next), and
spaced-repetition flashcards (coming after that). v1 focuses on the data
plane — auth, vocab CRUD, Notion-export CSV import, and per-user encrypted
LLM provider keys — so the AI-driven features can be added without rework.

## Features (v1)

- [x] Email/password auth with strict email verification (Auth.js v5)
- [x] Password reset over email, with all sessions invalidated on reset
- [x] Multi-user data model (every row scoped by `user_id`, cascading deletes)
- [x] CSV import for Notion-export format (1,900+ rows in one transaction)
- [x] Vocab CRUD with two-column lesson/theme filter (AND/OR), search, pagination
- [x] Settings page: pick LLM provider + model; per-provider AES-256-GCM
      encrypted API keys with masked display and explicit "reveal"
- [x] PWA support (installable, online-only)
- [x] Vitest unit tests + a Playwright happy-path E2E
- [x] Local Docker Compose for Postgres, Dockerfile mirroring production
- [x] Sub-path deployment (`/language-learning`) baked into Next config

## Roadmap

- LLM-powered tutor chat (Anthropic / OpenAI / Google, per-user)
- Flashcard mode with FSRS spaced repetition
- Photo OCR for vocab extraction from textbook images
- Voice/avatar features
- `.apkg` import/export

## Tech stack

- **Framework**: Next.js 16 (App Router, React 19, TypeScript, Tailwind v4)
- **UI**: shadcn/ui (Radix + base-ui primitives), sonner for toasts
- **Database**: PostgreSQL 16 (Dockerized), Drizzle ORM + drizzle-kit
- **Auth**: Auth.js v5 (`next-auth@beta`), JWT strategy, argon2id passwords
- **Email**: Resend
- **Validation**: Zod
- **CSV**: Papaparse
- **Encryption**: Node built-in `crypto` (AES-256-GCM)
- **Tests**: Vitest + Playwright
- **PWA**: `@ducanh2912/next-pwa`

## Prerequisites

- Node 20+ (project tested on 22.16). `.nvmrc` pins to 22 if you use `nvm`.
- pnpm (`npm install -g pnpm`)
- Docker + Docker Compose
- A free Resend account (or set `MOCK_EMAIL=1` to print verification links
  to the console for local dev — see below)

## Local development setup

```bash
# 1. Clone
git clone git@github.com:TheBuleGanteng/language-learning-bot.git
cd language-learning-bot

# 2. Install deps
pnpm install

# 3. Secrets
cp .env.example .env.local
# Then edit .env.local — at minimum, generate:
#   openssl rand -base64 32   # → AUTH_SECRET
#   openssl rand -base64 32   # → APP_ENCRYPTION_KEY
# and either set MOCK_EMAIL=1 (logs verify/reset links to the dev console)
# or paste a real Resend API key. EMAIL_FROM defaults are fine for either.

# 4. Database
docker compose up -d postgres
pnpm db:migrate

# 5. Run
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), sign up, watch the
console for the verification link (if `MOCK_EMAIL=1`), click it, log in,
and you should land on `/vocab`.

> **Postgres port note.** The local compose maps the container's 5432 to
> the host's **5433** so it doesn't clash with any existing system Postgres
> on 5432. `DATABASE_URL` in `.env.example` already reflects this.

## Importing your Notion vocab

The Notion CSV export format used here has columns: `Thai, English, Lessons, Tags`.

### Via the UI

1. Log in
2. Go to **Import** in the top nav (or visit `/vocab/import`)
3. Choose your CSV; the first 10 rows render as a preview
4. Click **Import N rows**. You'll see a summary with insert/skip counts.

The importer:

- Skips rows with empty Thai or English
- De-duplicates within the file by `(Thai, English)`
- Skips rows whose `(Thai, English)` is already in the DB for this user
- Strips the `(https://www.notion.so/…)` URL from lesson names
- Drops `lesson_N` tags (redundant — lessons live in their own table now)
- Find-or-creates lessons and tags in the same transaction

### Via the CLI

```bash
pnpm tsx scripts/import-notion-csv.ts your@email.com /path/to/notion-export.csv
```

Useful for seeding the user's first big import without going through the
upload UI.

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

### 4.5. Setting up GCS for file storage

Lesson PDFs and audio files use a pluggable storage abstraction
(`src/lib/storage`). In dev, files land on disk under `./storage`. In prod
we use Google Cloud Storage with v4 signed URLs (15-minute TTL).

1. Create a GCS bucket:
   ```bash
   gsutil mb -l us-central1 gs://kebayoran-language-learning-bot/
   ```

2. Create a service account:
   ```bash
   gcloud iam service-accounts create lang-storage \
     --display-name="Language Learning Bot storage"
   ```

3. Grant the SA write access to the bucket only (no project-wide perms):
   ```bash
   gsutil iam ch \
     serviceAccount:lang-storage@<PROJECT-ID>.iam.gserviceaccount.com:objectAdmin \
     gs://kebayoran-language-learning-bot
   ```

4. Download a JSON key:
   ```bash
   gcloud iam service-accounts keys create \
     /home/matt/secrets/language-learning-bot/gcs-sa.json \
     --iam-account lang-storage@<PROJECT-ID>.iam.gserviceaccount.com
   chmod 600 /home/matt/secrets/language-learning-bot/gcs-sa.json
   ```

5. Add to the production `.env`:
   ```
   STORAGE_DRIVER=gcs
   GCS_BUCKET=kebayoran-language-learning-bot
   GOOGLE_APPLICATION_CREDENTIALS=/app/secrets/gcs-sa.json
   ```

6. Mount the SA JSON read-only in `docker-compose.yml`:
   ```yaml
   volumes:
     - /home/matt/secrets/language-learning-bot/gcs-sa.json:/app/secrets/gcs-sa.json:ro
   ```

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

## API key configuration in the UI

Keys are stored encrypted at rest with AES-256-GCM, keyed by `APP_ENCRYPTION_KEY`
(a base64-encoded 32-byte key, generate with `openssl rand -base64 32`).
Plaintext is **never** returned to the UI by default — the GET endpoint
returns a masked preview (`sk-a••••••••••cdef`). The user must explicitly
click **Reveal** to ask for the plaintext, which fires a separate
`GET /api/settings?reveal=<provider>` call. Plaintext is held only in the
React component while revealed, never persisted to localStorage.

## Testing

```bash
pnpm test        # Vitest unit tests (crypto, tags, csv parsing)
pnpm test:e2e    # Playwright happy-path E2E (signup → import → settings)
```

The E2E suite needs the local Postgres to be running (`docker compose up -d postgres`)
and spins up its own dev server via Playwright's `webServer` config. It bypasses
the email link by setting `users.email_verified_at` directly, since the verification
token's raw value isn't recoverable from the hash stored in `verification_tokens`.

## Tag conventions

Imports normalize the Notion data into two independent dimensions:

- **Lessons** live in the `lessons` table — one row per lesson name, with
  a parsed `lesson_number` for sorting. CSV `Lessons` cells are joined to
  vocab items via `vocab_lessons`.
- **Thematic tags** (e.g. `food`, `greetings`, `verbs`) live in `tags` and
  attach via `vocab_tags`. The importer drops `lesson_N` tags during import
  because they're redundant with the lessons relation.

This means the vocab UI's two filter columns (Lessons + Themes) read from
separate tables — querying is straightforward and there's no double-counting.

## Model catalog freshness

The provider/model list (`src/lib/models.ts`) is hardcoded as of **May 2026**.
Verify currency at each provider's pricing page before deploying long-term, and
edit that file when models change. The list is the single source of truth
for both the settings dropdown and the (later) tutor implementation.

## Known limitations

- Rate limiting is in-memory and per-IP — resets on app restart. For multi-instance
  or higher-traffic deployments, swap with Redis (see `src/lib/rate-limit.ts`).
- The Auth.js sessions table exists for the adapter but isn't actively read
  (JWT strategy is in use); password reset invalidation works by bumping
  `users.sessions_invalidated_at` and checking it in the JWT callback.
- The PWA icons are placeholder squares with a white "L" — replace
  `public/icon-192.png` and `public/icon-512.png` with branded artwork
  before public launch (see `scripts/gen-icons.ts`).
- Build uses webpack (`next build --webpack`) because `@ducanh2912/next-pwa`
  needs webpack and Next 16 defaults to Turbopack. Dev still uses Turbopack.

## License

MIT — see [LICENSE](./LICENSE).
