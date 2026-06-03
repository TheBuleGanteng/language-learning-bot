# DEPLOY_CLAUDE.md — Automated deploy pipeline for Claude Code

This document tells Claude Code how to deploy changes to `language-learning-bot`
end-to-end: from a local code change to a verified production restart.

> Audience: Claude Code, running on the user's laptop, with shell access and
> the ability to SSH to the production VM.
> Human audience: read this if you're triaging a deploy or wanting to know
> what Claude Code did.

## What this pipeline covers

A normal code-only change in the `language-learning-bot` project:

1. Make code changes (per a separate spec or user request)
2. Run quality gates locally
3. Commit and push to the project repo (`language-learning-bot`)
4. Bump the submodule pointer in the infrastructure repo (`vm-infrastructure`)
5. Commit and push the infrastructure repo
6. SSH to the VM, pull both repos, rebuild the app container, restart
7. Verify the production app is healthy

## What this pipeline does NOT cover (pause and ask the user)

**STOP and ask the user before doing any of these:**

- Running database migrations against production (`pnpm db:migrate` in prod)
- Modifying `.env` files on the VM (`/home/matt/secrets/language-learning-bot/.env`
  or `/home/matt/vm-infrastructure/.env`)
- Modifying production secrets (rotating AUTH_SECRET, APP_ENCRYPTION_KEY, etc.)
- Schema-breaking code changes that would crash without a migration run first
- First-time deployments of risky features
- Anything destructive to production data (DB drops, bucket deletions, etc.)
- Changes to `docker-compose.yml` services other than `language-learning-bot`
- Changes to `nginx/conf.d/default.conf` that affect other apps' routing

If the user's request implies any of the above, pause, summarize what you'd do,
and wait for explicit confirmation.

## Repo / VM topology (reference)

- **Laptop project repo**: `/home/thebuleganteng/01_Repos/06_personal_work/language-learning-bot`
  GitHub: `git@github.com:TheBuleGanteng/language-learning-bot.git` (branch `main`)
- **Laptop infrastructure repo**: `/home/thebuleganteng/01_Repos/06_personal_work/vm-infrastructure`
  GitHub: `git@github.com:TheBuleGanteng/vm-infrastructure.git` (branch `main`)
  - Submodule path: `apps/language-learning-bot` → points at a commit of the project repo
- **VM**: `matt@35.209.112.146` (SSH alias `homepage-vm5`, GCP zone `us-central1-f`)
  Infrastructure path: `/home/matt/vm-infrastructure`
  Submodule path: `/home/matt/vm-infrastructure/apps/language-learning-bot`
- **Production URL**: https://kebayorantechnologies.com/language-learning

## Pipeline steps

### Step 1 — Make code changes

Whatever the user has asked for. Edit files in the project repo only:

```
cd /home/thebuleganteng/01_Repos/06_personal_work/language-learning-bot
```

Do NOT edit anything in `vm-infrastructure/apps/language-learning-bot/` — that's
the submodule and its source of truth is the project repo.

### Step 2 — Quality gates (MUST pass before pushing)

In the project repo:

```bash
pnpm lint
pnpm test
pnpm build
```

All three must complete successfully. If any fails:
- Don't push.
- Don't proceed to later steps.
- Report the failure to the user along with the relevant output.

### Step 3 — Commit and push the project repo

```bash
cd /home/thebuleganteng/01_Repos/06_personal_work/language-learning-bot
git status                  # confirm only intended files are modified
git add <specific files>    # explicit — do NOT use `git add -A`
git commit -m "<descriptive message following existing convention>"
git push origin main
```

**Don't use `git add -A`** — it sweeps in untracked files like backup dumps,
local scratch files, etc. Stage files explicitly.

Reasonable commit message conventions to follow (look at recent log for the
prevailing style):
- `fix(scope): ...` for bug fixes
- `feat(scope): ...` for new features
- `chore(scope): ...` for non-functional changes (deps, formatting)
- `docs(scope): ...` for documentation

### Step 4 — Bump submodule pointer in infrastructure repo

```bash
cd /home/thebuleganteng/01_Repos/06_personal_work/vm-infrastructure/apps/language-learning-bot
git pull origin main
cd /home/thebuleganteng/01_Repos/06_personal_work/vm-infrastructure
git status                              # should show apps/language-learning-bot modified
git add apps/language-learning-bot
git commit -m "chore: bump language-learning-bot submodule"
git push origin main
```

### Step 5 — Deploy on the VM

SSH from laptop and run the deploy:

```bash
ssh matt@35.209.112.146 << 'EOF'
set -e
cd /home/matt/vm-infrastructure
git pull
git submodule update --init --recursive
docker compose build language-learning-bot
docker compose up -d --force-recreate language-learning-bot
EOF
```

The `set -e` causes the remote script to abort on any error. The heredoc form
prevents needing multiple SSH invocations. If SSH multiplexing isn't set up
and SSH prompts for a passphrase, run the steps individually instead — but
they should all run successfully and in order.

### Step 6 — Verify

After Step 5 completes, verify production is healthy. From the laptop:

```bash
# HTTP health check — should return 200 or 3xx
curl -I https://kebayorantechnologies.com/language-learning

# Get recent app logs from VM
ssh matt@35.209.112.146 'cd /home/matt/vm-infrastructure && docker compose logs language-learning-bot --tail 50'
```

Look for:
- HTTP 200 or 3xx from curl (4xx/5xx = problem)
- No stack traces, "Error", or "panic" in the logs
- A clean Next.js startup message ("Ready in ...ms" or similar)

If anything looks wrong, report the output to the user immediately and DO NOT
attempt rollback automatically.

## Rollback

Rollback is a user-driven decision, NOT something to do automatically. If the
deploy left production broken:

1. Tell the user what failed
2. Wait for instructions

If the user asks for a rollback, do this:

```bash
# Find the previous good commit in vm-infrastructure
cd /home/thebuleganteng/01_Repos/06_personal_work/vm-infrastructure
git log --oneline -10

# Revert the submodule bump commit (replace <hash> with the bad commit)
git revert <hash>
git push origin main

# Re-run the VM deploy steps from Step 5
```

The submodule pointer goes back to the previous version, and the rebuild
picks up the previous version's image.

## Common failures and how to handle them

- **`pnpm build` fails locally**: investigate, fix, retry. Don't push.
- **`pnpm test` fails**: same — fix tests or fix the regression they caught.
- **`git push` fails with non-fast-forward**: the remote moved (someone else
  pushed). Pull, rebase, retry. Don't force-push.
- **Docker build fails on the VM with OOM**: the VM needs more memory or swap.
  Tell the user; don't try to add swap automatically.
- **App container fails health check after restart**: check `docker compose
  logs language-learning-bot --tail 100` for stack traces. Report to user.
- **Site returns 502/503**: nginx can reach the app but the app is failing.
  Same — get logs, report to user.

## Things not to touch in a normal deploy

- The host nginx (currently disabled — should stay disabled)
- Postgres data directory or volume
- GCS bucket contents (vocab images, backups)
- The service account JSON key on the VM
- `/home/matt/secrets/language-learning-bot/.env`
- `/home/matt/vm-infrastructure/.env` (Postgres password for docker-compose)

## After deploy

Update the user's running tally of bugs/features with what shipped. The
project keeps `ERROR_REPORT.md` and other in-project changelogs; mention what
was deployed in the appropriate place if those exist.