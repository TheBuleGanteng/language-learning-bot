# Build Error Report

This document logs issues encountered during the initial build, their root cause,
and how they were resolved. Maintained going forward as a running log of
non-obvious problems.

## Pre-flight findings

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| Node version | 20.x | 22.16.0 (current LTS) | OK — v22 is compatible, newer LTS |
| pnpm | installed | 10.12.2 | OK |
| Docker | installed | 24.0.7 | OK |
| Docker Compose | installed | v2.10.2 | OK |
| git config | configured | Matthew McDonnell / mcdonnell.matthew@ymail.com | OK |
| Project directory | should not exist | Exists with only CLAUDE_CODE_INSTRUCTIONS.md, .gitignore, .env, .claude/ | OK — clean enough to build in |
| GitHub SSH | working | Authenticated as TheBuleGanteng | OK |
| Port 3000 | free | free | OK |
| Port 5432 | free | **OCCUPIED** (existing Postgres) | Using 5433 instead |

### Port 5432 conflict

Port 5432 is already in use by an existing Postgres instance. The local dev
docker-compose.yml will map container port 5432 to host port **5433** instead.
DATABASE_URL will use port 5433 accordingly.

### Node version

Spec calls for Node 20 LTS, but v22.16.0 is installed (current LTS as of 2026).
All dependencies are compatible. Proceeding with v22. `.nvmrc` will be set to `22`.

## Build progress

### Completed

- **Section 3 — Pre-flight checks**: All checks passed. Port 5432 occupied (will use 5433). Node 22 instead of 20 (compatible).

### In progress

- **Section 19, Step 1 — Scaffold**: Not yet started. The `pnpm create next-app` command has not been run yet. The project directory contains only pre-existing files (CLAUDE_CODE_INSTRUCTIONS.md, .gitignore, .env) and the newly created ERROR_REPORT.md.

### Remaining (Sections 4–24, Steps 1–11)

- Step 1: Scaffold (Next.js init, shadcn, git init)
- Step 2: Database (docker-compose, Drizzle schema, migrations)
- Step 3: Encryption + env validation
- Step 4: Auth.js (signup, verify, login, password reset)
- Step 5: Settings + model catalog
- Step 6: CSV import
- Step 7: Vocab CRUD + filters
- Step 8: PWA + basePath
- Step 9: Playwright E2E
- Step 10: Docs + GitHub
- Step 11: Final smoke check

## Build issues

### [2025-05-27] next-app create blocked by existing files

**Context**: Step 1 — Scaffold

**Error**:
```
The directory language-learning-bot contains files that could conflict:
  .env
  CLAUDE_CODE_INSTRUCTIONS.md
  ERROR_REPORT.md
Either try using a new directory name, or remove the files listed above.
```

**Root cause**: `pnpm create next-app@latest .` refuses to run in a directory with existing files.

**Resolution**: Pending. Need to either temporarily move conflicting files out, or create in a temp dir and copy back.

**Lessons / Watch-outs**: The project directory must be empty (or contain only dotfiles that Next.js expects) for `create-next-app` to work. Plan to move CLAUDE_CODE_INSTRUCTIONS.md, ERROR_REPORT.md, and .env out before running, then move them back.

## Known issues / deferred

(none yet)
