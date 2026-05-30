# Deployment Guide

This document covers deploying `language-learning-bot` to the existing
**kebayorantechnologies.com** GCP VM (us-central1-f), served at
`https://kebayorantechnologies.com/language-learning` behind the nginx reverse
proxy in the `vm-infrastructure` docker-compose stack.

It mirrors the `computer-vision-classification` deployment pattern: a Dockerfile
in this repo, build-time base-path args, runtime env vars, an nginx location
block for the sub-path, and secrets volume-mounted from outside the repo.

> This is a runbook for **manual** execution on the VM. The project-side
> changes (Dockerfile, base-path support, GCS fix, `.env.example`) are already
> committed in this repo. The vm-infrastructure changes below are applied by
> hand. Two starter snippets already live in this repo:
> `docker-compose.prod.yml` and `nginx/language-learning.conf.snippet`.

## Production stack

- **App** — Next.js 16 standalone build in a container at `:3000` on the docker
  network, served via nginx under `/language-learning`.
- **DB** — Postgres 16 as a service in the vm-infrastructure compose stack
  (only reachable on the docker network; no host port in prod).
- **Storage** — GCS bucket `language-learning-bot` (asia-southeast1, uniform
  access, bucket-wide public read).
- **Email** — Resend, verified domain; transactional email for signup
  verification and password reset.
- **Secrets** — mounted from `/home/matt/secrets/language-learning-bot/`,
  never baked into the image (`.dockerignore` excludes `secrets/` and `.env*`).

## Auth model (so the env vars make sense)

Auth is **email + password** with Resend-backed email verification and password
reset (next-auth v5 Credentials provider, `trustHost: true`). There is no
OAuth/magic-link provider. The relevant env vars are `AUTH_SECRET`,
`AUTH_TRUST_HOST=true`, `NEXTAUTH_URL`, `RESEND_API_KEY`, and `EMAIL_FROM`.

## Prerequisites (one-time, already complete)

- ✅ GCS bucket `language-learning-bot` (asia-southeast1, uniform access,
  bucket-wide public read)
- ✅ Service account with Storage Object Admin on the bucket; JSON key stored
  locally under this repo's gitignored `secrets/` directory
- ✅ Resend domain verified; `EMAIL_FROM` uses an address on that domain

---

## Step 1 — On your laptop: generate production secrets

```bash
# AUTH_SECRET — must differ from dev (>= 32 bytes)
openssl rand -base64 32

# APP_ENCRYPTION_KEY — must differ from dev (>= 32 bytes)
openssl rand -base64 32

# Postgres password
openssl rand -base64 24
```

Keep these somewhere safe; you'll paste them into the env file on the VM.

## Step 2 — Push project changes to GitHub

The deployment-prep commits should already be on `main`:

```bash
git status       # clean
git push origin main
```

## Step 3 — On the VM: add the app to vm-infrastructure as a submodule

```bash
cd ~/01_Repos/06_personal_work/vm-infrastructure
git submodule add https://github.com/TheBuleGanteng/language-learning-bot apps/language-learning-bot
git submodule update --init --recursive
```

## Step 4 — On the VM: place secrets

```bash
sudo mkdir -p /home/matt/secrets/language-learning-bot
sudo chmod 700 /home/matt/secrets/language-learning-bot
```

Copy the GCS service-account JSON from your laptop to the VM:

```bash
# From your laptop (the key lives in this repo's gitignored secrets/ folder):
scp secrets/<service-account-key>.json \
    matt@VM_IP:/home/matt/secrets/language-learning-bot/gcs-credentials.json
```

Create the production env file at
`/home/matt/secrets/language-learning-bot/.env` (the compose service loads it
via `env_file`). Use the **real variable names this app reads** (see
`src/lib/env.ts`):

```bash
DATABASE_URL=postgresql://lang:PASTE_POSTGRES_PASSWORD@language-learning-postgres:5432/language_learning
AUTH_SECRET=PASTE_AUTH_SECRET
AUTH_TRUST_HOST=true
NEXTAUTH_URL=https://kebayorantechnologies.com/language-learning
APP_ENCRYPTION_KEY=PASTE_APP_ENCRYPTION_KEY
RESEND_API_KEY=PASTE_RESEND_KEY
EMAIL_FROM="Language Learning Bot <noreply@mattmcdonnell.net>"
APP_URL=https://kebayorantechnologies.com/language-learning
NODE_ENV=production
NEXT_PUBLIC_BASE_PATH=/language-learning
STORAGE_DRIVER=gcs
GCS_BUCKET=language-learning-bot
GOOGLE_APPLICATION_CREDENTIALS=/app/secrets/gcs-credentials.json
```

Lock the files down:

```bash
chmod 600 /home/matt/secrets/language-learning-bot/.env
chmod 600 /home/matt/secrets/language-learning-bot/gcs-credentials.json
```

> `NEXT_PUBLIC_BASE_PATH` is inlined into the client bundle at **build** time,
> so it is also passed as a Docker build arg in Step 5 — setting it at runtime
> alone is not enough.

## Step 5 — On the VM: extend vm-infrastructure's docker-compose.yml

The starter snippet is in this repo at `docker-compose.prod.yml`. Merge a
Postgres service and the app service into the vm-infrastructure compose file:

```yaml
  # Shared Postgres for the language-learning app
  language-learning-postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: lang
      POSTGRES_PASSWORD: ${LANG_POSTGRES_PASSWORD}
      POSTGRES_DB: language_learning
    volumes:
      - lang_pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U lang -d language_learning"]
      interval: 10s
      timeout: 5s
      retries: 5
    # No host port exposed — only reachable on the docker network.

  # Language Learning Bot (Next.js)
  language-learning-bot:
    build:
      context: ./apps/language-learning-bot
      dockerfile: Dockerfile
      args:
        - GCP_DEPLOYMENT=true
        - WEB_BASEPATH=/language-learning
        - NEXT_PUBLIC_BASE_PATH=/language-learning
    restart: unless-stopped
    env_file:
      - /home/matt/secrets/language-learning-bot/.env
    volumes:
      - /home/matt/secrets/language-learning-bot/gcs-credentials.json:/app/secrets/gcs-credentials.json:ro
    depends_on:
      language-learning-postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/language-learning"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
```

Add to the top-level `volumes:` block:

```yaml
volumes:
  lang_pg_data:
```

Provide the Postgres password to compose (top-level `.env` next to the compose
file — separate from the app's secret env):

```bash
echo "LANG_POSTGRES_PASSWORD=PASTE_POSTGRES_PASSWORD" >> .env
```

Add `language-learning-bot` to the nginx service's `depends_on` list.

## Step 6 — On the VM: add the nginx location block

The starter is in this repo at `nginx/language-learning.conf.snippet`. Inside
the `server { ... }` block for `kebayorantechnologies.com`, add this **before**
the catch-all `location / { ... }` (nginx matches specific paths first):

```nginx
    # Language Learning Bot - Next.js app
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

        # Larger uploads (textbook photos, audio files)
        client_max_body_size 50M;

        # Longer timeouts for LLM-bound endpoints
        proxy_read_timeout 600s;
        proxy_connect_timeout 600s;
        proxy_send_timeout 600s;
    }
```

## Step 7 — On the VM: build and start

```bash
cd ~/01_Repos/06_personal_work/vm-infrastructure
docker compose build language-learning-bot
docker compose up -d language-learning-postgres
# Wait for postgres to report healthy:
docker compose exec language-learning-postgres pg_isready -U lang -d language_learning
docker compose up -d language-learning-bot
```

## Step 8 — Run database migrations

Drizzle migrations are bundled into the image (`src/db/migrations` +
`drizzle.config.ts`), **but** the runner image is a bare `node` runtime — it has
neither `pnpm` nor `drizzle-kit` (a devDependency). So `pnpm db:migrate` inside
the running container will not work. Use one of:

**Option A — one-off container with dev dependencies (recommended).** Run
drizzle-kit from a throwaway build-stage container that has the full toolchain,
on the same network and env:

```bash
cd ~/01_Repos/06_personal_work/vm-infrastructure
docker compose run --rm --no-deps \
  --entrypoint sh \
  -e DATABASE_URL="postgresql://lang:PASTE_POSTGRES_PASSWORD@language-learning-postgres:5432/language_learning" \
  language-learning-bot -c "corepack enable && pnpm install --frozen-lockfile && pnpm db:migrate"
```

(If the runtime image is too slim for this, build a temporary image that
targets the Dockerfile `build` stage and run `pnpm db:migrate` from it.)

**Option B — from your laptop.** Temporarily expose the postgres port on the VM
(or use an SSH tunnel), point `DATABASE_URL` at it, and run `pnpm db:migrate`
locally against the prod DB. Close the port afterwards.

## Step 9 — Reload nginx

```bash
docker compose restart nginx   # or: docker compose exec nginx nginx -s reload
```

## Step 10 — Verify

```bash
# From your laptop:
curl -I https://kebayorantechnologies.com/language-learning
# Expect HTTP 200 or a redirect to /language-learning/login
```

In a browser at `https://kebayorantechnologies.com/language-learning`:

- Login page loads (note the sub-path is part of the URL)
- Sign up → verification email arrives (check spam)
- After login, the vocab page loads (empty in a fresh DB)
- Settings page is reachable

## Step 11 — Import existing dev data (optional)

```bash
# On laptop: dump from dev (host port 5433)
pg_dump -h localhost -p 5433 -U lang -d language_learning -F c -f langbot-backup.dump

# Copy to VM
scp langbot-backup.dump matt@VM_IP:/tmp/

# On VM: restore
docker compose exec language-learning-postgres \
  pg_restore -U lang -d language_learning --clean --if-exists /tmp/langbot-backup.dump
```

Images generated in dev live on the laptop's local FS under `./storage/`, not
GCS. Either upload them with
`gsutil cp -r storage/public/users gs://language-learning-bot/public/users/`,
or simply regenerate them in production (preferred — prod writes straight to
GCS via the fixed `putPublic`).

## Backup pattern

Daily cron on the VM:

```bash
crontab -e
# 0 3 * * * docker compose -f /home/matt/01_Repos/06_personal_work/vm-infrastructure/docker-compose.yml exec -T language-learning-postgres pg_dump -U lang -d language_learning -F c > /home/matt/backups/langbot-$(date +\%Y\%m\%d).dump
```

Rotate dumps older than 30 days.

## Troubleshooting

### App container fails to start
`docker compose logs language-learning-bot --tail 100`. Common causes:
- env file not loaded — check the `env_file` path in compose
- DB not ready — `docker compose logs language-learning-postgres`
- env validation: `src/lib/env.ts` refuses to start in production if required
  vars are missing or `STORAGE_DRIVER=gcs` without `GCS_BUCKET` +
  `GOOGLE_APPLICATION_CREDENTIALS`

### 502 Bad Gateway from nginx
App container not reachable on the docker network:
- `docker compose ps` — is it running?
- nginx `proxy_pass` host (`language-learning-bot`) must match the service name

### Auth redirects to the wrong place
`NEXTAUTH_URL` must exactly match the deployed URL **including** the
`/language-learning` sub-path. `AUTH_TRUST_HOST=true` must be set.

### Assets 404 under the sub-path / API calls 404
`NEXT_PUBLIC_BASE_PATH` must be set **at build time** (Docker build arg in
Step 5), not just at runtime — it is inlined into the client bundle. A rebuild
is required after changing it.

### GCS errors at runtime ("permission denied", "not found")
- `docker compose exec language-learning-bot ls -la /app/secrets/` — is the key
  mounted?
- `GOOGLE_APPLICATION_CREDENTIALS` points at the mounted path
- service account has Storage Object Admin on the bucket
