# Deployment Guide

This document covers deploying `language-learning-bot` to the existing
**kebayorantechnologies.com** GCP VM (us-central1-f), served at
`https://kebayorantechnologies.com/language-learning` behind the nginx reverse
proxy in the `vm-infrastructure` docker-compose stack.

It mirrors the `computer-vision-classification` deployment pattern: a Dockerfile
in this repo, build-time base-path args, runtime env vars, an nginx location
block for the sub-path, and secrets volume-mounted from outside the repo.

## Flow at a glance

**Phase A — On your laptop**: All code changes happen here (both this repo
and the vm-infrastructure repo). Commit and push to GitHub.

**Phase B — On the VM**: SSH in, pull, place secrets, build, run.

This separation reflects the repo discipline: edits only happen in the
relevant project directory on the laptop; the VM only pulls and runs.

## Production stack

- **App** — Next.js 16 standalone build in a container at `:3000` on the docker
  network, served via nginx under `/language-learning`.
- **DB** — Postgres 16 as a service in the vm-infrastructure compose stack
  (only reachable on the docker network; no host port in prod).
- **Storage** — GCS bucket `language-learning-bot` (asia-southeast1, uniform
  access, bucket-wide public read).
- **Backups** — GCS bucket `language-learning-bot-backups` (us-central1,
  uniform access, public access prevention ON, 30-day lifecycle).
- **Email** — Resend, verified domain `mattmcdonnell.net`; transactional email
  for signup verification and password reset.
- **Secrets** — mounted from `/home/matt/secrets/language-learning-bot/`,
  never baked into the image (`.dockerignore` excludes `secrets/` and `.env*`).

## Auth model (so the env vars make sense)

Auth is **email + password** with Resend-backed email verification and password
reset (next-auth v5 Credentials provider, `trustHost: true`). There is no
OAuth/magic-link provider. The relevant env vars are `AUTH_SECRET`,
`AUTH_TRUST_HOST=true`, `NEXTAUTH_URL`, `RESEND_API_KEY`, and `EMAIL_FROM`.

## Prerequisites (one-time, already complete)

- ✅ GCS bucket `language-learning-bot` (asia-southeast1, uniform access,
  bucket-wide public read) — for vocab images and app files
- ✅ GCS bucket `language-learning-bot-backups` (us-central1, uniform access,
  public access prevention ON) — for daily Postgres dumps
- ✅ Service account `language-learning-bot@homepage-417007.iam.gserviceaccount.com`
  with:
  - Storage Object Admin on `language-learning-bot`
  - Storage Object Creator on `language-learning-bot-backups`
- ✅ matt@mattmcdonnell.net as admin on the backups bucket
- ✅ JSON key stored locally under this repo's gitignored `secrets/` directory
- ✅ Resend domain `mattmcdonnell.net` already verified; `EMAIL_FROM` uses
  `noreply@mattmcdonnell.net`

> If the service account doesn't yet have Storage Object Creator on the
> backups bucket, add it now via the bucket's Permissions tab. The backup
> cron uses this same service account.

---

# Phase A — On your laptop

## A.1 — Generate production secrets

```bash
# AUTH_SECRET — must differ from dev (>= 32 bytes)
openssl rand -base64 32

# APP_ENCRYPTION_KEY — must differ from dev (>= 32 bytes)
openssl rand -base64 32

# Postgres password
openssl rand -base64 24
```

Keep these in your password manager or a secure note. You'll paste them on
the VM later.

## A.2 — Push project changes to GitHub

The deployment-prep commits should already be on `main`:

```bash
cd ~/01_Repos/06_personal_work/language-learning-bot
git status     # should be clean
git push origin main
```

## A.3 — Add the app as a submodule in vm-infrastructure (on laptop)

Use SSH for consistency with existing submodules (`git@github.com:TheBuleGanteng/...`):

```bash
cd ~/01_Repos/06_personal_work/vm-infrastructure
git submodule add git@github.com:TheBuleGanteng/language-learning-bot.git apps/language-learning-bot
git submodule update --init --recursive
```

## A.4 — Update vm-infrastructure's docker-compose.yml

Edit `~/01_Repos/06_personal_work/vm-infrastructure/docker-compose.yml`. Add a
new Postgres service AND a service for the app inside the `services:` block:

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

Add to the top-level `volumes:` block (it may currently be `volumes: {}`):

```yaml
volumes:
  lang_pg_data:
```

Add `language-learning-bot` to the nginx service's `depends_on` list.

## A.5 — Update nginx config

Edit `~/01_Repos/06_personal_work/vm-infrastructure/nginx/conf.d/default.conf`.

Inside the `server { ... }` block for `kebayorantechnologies.com`, add this
**before** the catch-all `location / { ... }` (nginx matches specific paths
first):

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

## A.6 — Commit and push vm-infrastructure

```bash
cd ~/01_Repos/06_personal_work/vm-infrastructure
git add .gitmodules apps/language-learning-bot docker-compose.yml nginx/conf.d/default.conf
git status   # verify what's staged
git commit -m "feat: add language-learning-bot at /language-learning"
git push
```

Note: the `apps/language-learning-bot` entry is the submodule pointer (a
"gitlink"), not the app's source. The app source lives in its own repo.

---

# Phase B — On the VM

SSH in (you're matt@homepage-vm5 at 35.209.112.146), pull, place secrets, run.

## B.1 — SSH and pull

```bash
ssh matt@35.209.112.146
cd /home/matt/vm-infrastructure
git pull
git submodule update --init --recursive
```

The `git pull` fetches your updated `docker-compose.yml` and `nginx/conf.d/default.conf`.
The submodule update clones `language-learning-bot` at the commit you pinned.

## B.2 — Place secrets

```bash
mkdir -p /home/matt/secrets/language-learning-bot
chmod 700 /home/matt/secrets/language-learning-bot
```

Upload the GCS service-account JSON from your laptop. In a NEW terminal on
your laptop:

```bash
scp ~/01_Repos/06_personal_work/language-learning-bot/secrets/homepage-417007-*.json \
    matt@35.209.112.146:/home/matt/secrets/language-learning-bot/gcs-credentials.json
```

Back on the VM, create the production env file at
`/home/matt/secrets/language-learning-bot/.env`:

```bash
nano /home/matt/secrets/language-learning-bot/.env
```

Paste this (using the secrets you generated in A.1):

```
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
> which is why it's also a Docker build arg in A.4 — runtime alone isn't
> enough.

## B.3 — Add POSTGRES_PASSWORD to docker-compose's .env

Docker Compose reads variable substitutions like `${LANG_POSTGRES_PASSWORD}`
from a file called `.env` next to the compose file.

```bash
cd /home/matt/vm-infrastructure
echo "LANG_POSTGRES_PASSWORD=PASTE_POSTGRES_PASSWORD" >> .env
chmod 600 .env
```

Verify `.env` is gitignored:

```bash
grep -E '^\.env$|^\.env\b' .gitignore || echo "WARNING: .env may not be ignored"
```

If not gitignored, add `.env` to `.gitignore`.

The password value must match what you used in `DATABASE_URL` in step B.2.

## B.4 — Build and start

```bash
cd /home/matt/vm-infrastructure
docker compose build language-learning-bot
# First build takes 10-15 minutes (Tiptap, OpenAI SDK, etc. are big)

docker compose up -d language-learning-postgres
# Wait ~15 seconds, then verify postgres is healthy:
docker compose exec language-learning-postgres pg_isready -U lang -d language_learning

docker compose up -d language-learning-bot
```

## B.5 — Run database migrations

The runner image has no `pnpm` or `drizzle-kit`. Use a one-off container with
full dev dependencies on the same network:

```bash
cd /home/matt/vm-infrastructure
docker compose run --rm --no-deps \
  --entrypoint sh \
  -e DATABASE_URL="postgresql://lang:PASTE_POSTGRES_PASSWORD@language-learning-postgres:5432/language_learning" \
  language-learning-bot -c "corepack enable && pnpm install --frozen-lockfile && pnpm db:migrate"
```

If the runner image strips too much for `pnpm install` to work, build a
throwaway image that targets the Dockerfile `build` stage:

```bash
cd /home/matt/vm-infrastructure/apps/language-learning-bot
docker build --target builder -t lang-migrator:tmp .
docker run --rm --network vm-infrastructure_default \
  -e DATABASE_URL="postgresql://lang:PASTE_POSTGRES_PASSWORD@language-learning-postgres:5432/language_learning" \
  lang-migrator:tmp pnpm db:migrate
docker rmi lang-migrator:tmp
```

(The docker network name `vm-infrastructure_default` may differ — check with
`docker network ls` if needed.)

## B.6 — Reload nginx

```bash
cd /home/matt/vm-infrastructure
docker compose restart nginx
```

## B.7 — Verify

From your laptop:

```bash
curl -I https://kebayorantechnologies.com/language-learning
# Expect HTTP 200, or a redirect to /language-learning/login
```

In a browser, navigate to `https://kebayorantechnologies.com/language-learning`
and verify:

- Login/signup page loads at the sub-path
- Sign up → verification email arrives at your inbox (check spam)
- After verifying and logging in, the vocab page loads (will be empty)
- Settings page is reachable
- Try generating one image to verify GCS write-path works

## B.8 — Import existing dev data (optional)

The dev database has all your vocab, lessons, files, and generated images. To
migrate:

```bash
# On laptop: dump from dev (host port 5433)
pg_dump -h localhost -p 5433 -U lang -d language_learning -F c -f langbot-backup.dump

# Copy to VM
scp langbot-backup.dump matt@35.209.112.146:/tmp/

# On VM: restore
ssh matt@35.209.112.146
cd /home/matt/vm-infrastructure
docker compose exec language-learning-postgres \
  pg_restore -U lang -d language_learning --clean --if-exists /tmp/langbot-backup.dump
```

Images generated in dev live on the laptop's local FS under `./storage/`, not
GCS. Either upload them with:

```bash
gsutil cp -r ~/01_Repos/06_personal_work/language-learning-bot/storage/public/users \
  gs://language-learning-bot/public/users/
```

Or simply regenerate them in production (preferred — prod writes straight to
GCS via the fixed `putPublic`).

## B.9 — Set up automated backups

The backup bucket `language-learning-bot-backups` is ready with a 30-day
lifecycle rule. The service account has Storage Object Creator on it. Set up
a nightly cron that dumps Postgres and uploads to the bucket.

### Install gcloud / gsutil on the VM (if not already)

Check first:

```bash
which gsutil
```

If not installed:

```bash
sudo apt-get update
sudo apt-get install -y google-cloud-cli
```

### Configure gsutil to use the service account

```bash
gcloud auth activate-service-account \
  --key-file=/home/matt/secrets/language-learning-bot/gcs-credentials.json
```

This authenticates `gsutil` and `gcloud` as the service account. Test:

```bash
gsutil ls gs://language-learning-bot-backups/
# Should succeed (and show nothing the first time)
```

### Create the backup script

```bash
mkdir -p /home/matt/scripts
nano /home/matt/scripts/backup-langbot.sh
```

Paste:

```bash
#!/bin/bash
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
DUMP_FILE="/tmp/langbot-${TIMESTAMP}.dump"

# Dump the DB
docker compose -f /home/matt/vm-infrastructure/docker-compose.yml \
  exec -T language-learning-postgres \
  pg_dump -U lang -d language_learning -F c > "${DUMP_FILE}"

# Upload to GCS (gsutil picks up service account auth from gcloud config)
gsutil cp "${DUMP_FILE}" "gs://language-learning-bot-backups/langbot-${TIMESTAMP}.dump"

# Clean up local file
rm "${DUMP_FILE}"

echo "Backup uploaded: gs://language-learning-bot-backups/langbot-${TIMESTAMP}.dump"
```

Make it executable:

```bash
chmod +x /home/matt/scripts/backup-langbot.sh
```

### Test the script

```bash
/home/matt/scripts/backup-langbot.sh
```

You should see `Backup uploaded: gs://...`. Verify in the GCS console that the
file appeared.

### Schedule daily

```bash
crontab -e
```

Add (runs at 3:00 AM VM time, output appended to a log):

```
0 3 * * * /home/matt/scripts/backup-langbot.sh >> /home/matt/scripts/backup-langbot.log 2>&1
```

The 30-day lifecycle rule on the bucket auto-deletes old dumps; you don't need
to prune manually.

### Restore from a backup (when needed)

```bash
# Download a specific dump
gsutil cp gs://language-learning-bot-backups/langbot-YYYYMMDD-HHMMSS.dump /tmp/

# Restore on VM
cd /home/matt/vm-infrastructure
docker compose exec -T language-learning-postgres \
  pg_restore -U lang -d language_learning --clean --if-exists /tmp/langbot-*.dump
```

---

## Troubleshooting

### App container fails to start

```bash
docker compose logs language-learning-bot --tail 100
```

Common causes:
- env file not loaded — check the `env_file` path in compose
- DB not ready — `docker compose logs language-learning-postgres`
- env validation: `src/lib/env.ts` refuses to start in production if required
  vars are missing or `STORAGE_DRIVER=gcs` without `GCS_BUCKET` +
  `GOOGLE_APPLICATION_CREDENTIALS`

### 502 Bad Gateway from nginx

App container not reachable on the docker network:
- `docker compose ps` — is it running and healthy?
- nginx `proxy_pass` host (`language-learning-bot`) must match the compose
  service name

### Auth redirects to the wrong place

`NEXTAUTH_URL` must exactly match the deployed URL **including** the
`/language-learning` sub-path. `AUTH_TRUST_HOST=true` must be set.

### Assets 404 under the sub-path / API calls 404

`NEXT_PUBLIC_BASE_PATH` must be set **at build time** (Docker build arg in
A.4), not just at runtime — it is inlined into the client bundle. A rebuild
is required after changing it.

### GCS errors at runtime ("permission denied", "not found")

- `docker compose exec language-learning-bot ls -la /app/secrets/` — is the key
  mounted?
- `GOOGLE_APPLICATION_CREDENTIALS` points at the mounted path
- service account has Storage Object Admin on `language-learning-bot`

### Backup script fails

- `gsutil ls gs://language-learning-bot-backups/` — does the service account
  have access? If "AccessDeniedException", verify Storage Object Creator was
  granted on the bucket.
- Check cron log: `tail /home/matt/scripts/backup-langbot.log`
- Check the auth state: `gcloud auth list` should show the service account
  as ACTIVE