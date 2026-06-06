# Kaojai — language-learning bot

Kaojai is a self-hosted, multi-user web app for learning a language with **your
own** vocabulary. You curate the words you care about — typed in, imported from
CSV, or extracted from photos of a textbook — study them with spaced-repetition
flashcards, and practice them out loud with an AI voice tutor, "Kruu Bingo,"
that knows what's in your decks. The whole interface is multilingual, with a
per-user base language.

> The target language is currently Thai; the base-language / UI locale can be
> English, Simplified or Traditional Chinese, Korean, or Bahasa Indonesia.

This README has two parts: a guide **[For Users](#for-users)** and a guide
**[For Developers](#for-developers)**.

---

# For Users

## Objective

Kaojai is for self-directed language learners who want to study **their own**
vocabulary rather than a fixed course's word lists. You build a personal
dictionary (by hand, by import, or by snapping a photo of your notes), organize
it into lessons and themes, drill it with flashcards that schedule themselves
around what you keep forgetting, and rehearse it in spoken conversation with an
AI tutor. It is multi-user and self-hosted: each person has a private account,
private-by-default vocabulary, and the option to share items, lessons, and tags
with others on the same instance.

## Key sections of the app

- **Vocabulary** — the heart of the app. Create, edit, tag, and organize vocab
  items, each with a target-language word, a meaning in your base language,
  optional transliteration, example sentences, and notes. Filter by lesson,
  theme, creator, or image status; select items in bulk; and export a selection
  to CSV (you pick which columns).
- **Lessons** — group vocabulary into lessons and attach resources: **Notes**
  (PDF uploads, shown as first-page thumbnails that open a full scrollable
  viewer) and **resource links** categorized as DLS audio, Quizlet sets, and
  DLS exercises.
- **Flashcards / decks** — build decks from a tag, a lesson, or a manual
  selection, and study them with spaced repetition (forward, reverse, or both
  directions). Scheduling is handled by an FSRS algorithm that adapts to your
  performance per card.
- **Practice (Kruu Bingo)** — real-time spoken practice with an AI voice tutor
  over a live audio connection. Two modes: **deck practice** (grounded in a
  specific deck's vocabulary) and **free conversation** (open-ended). Live
  captions can show your base language, the target language, or a romanized
  form, and sliders tune how much base language the tutor mixes in and how fast
  it speaks — both apply mid-session.
- **Photo & camera extraction** — add vocabulary by uploading photos or using
  your device camera. Capture one or more images, optionally crop them, and a
  vision-capable model extracts candidate words for you to review (edit text,
  set tags and lessons, drop rows) before saving. The review screen works on
  both desktop and phones.
- **Settings** — set your target and base language, enter your AI provider API
  keys, choose which model powers each AI feature, and manage your display name
  and account.

## Requirements (API keys)

The AI features — voice practice, photo extraction, and image generation — are
powered by API keys you provide in **Settings**. Keys are stored **encrypted at
rest** and are never exposed back to the browser.

- Different features can use different providers/models, which you choose in
  Settings: chat/voice practice, photo (vision) extraction, and vocab image
  generation each have their own model selection.
- An admin may configure a **global key** that covers users who haven't entered
  their own, so you can try the app before bringing your own key.
- **Per-user monthly spend caps** apply to metered AI features (image
  generation and voice practice), so costs stay bounded.

Get a key from the provider you want to use, then paste it into Settings:

- **Anthropic (Claude)** — <https://console.anthropic.com/settings/keys>
- **OpenAI** — <https://platform.openai.com/api-keys>
- **Google AI Studio (Gemini)** — <https://aistudio.google.com/app/apikey>

## Getting started

1. **Sign up** with your email and password, then click the verification link
   sent to your inbox.
2. **Set your languages** in Settings (target language to learn, base language
   for the UI and meanings).
3. **Add your AI key(s)** in Settings if you want photo extraction, image
   generation, or voice practice (or rely on an admin-provided global key).
4. **Add vocabulary** — type it in, import a CSV, or snap a photo and review the
   extracted words.
5. **Build a deck** from a lesson, a tag, or a manual selection.
6. **Study** with flashcards, and **practice** out loud with Kruu Bingo.

---

# For Developers

## Stack

- **Next.js 16** (App Router, served under the `/language-learning` base path in
  production) + **React 19** + **TypeScript**
- **PostgreSQL** + **Drizzle ORM** (migrations in `src/db/migrations`)
- **Auth.js v5** (credentials provider, JWT sessions) with **argon2** password
  hashing and email verification
- **Tailwind CSS v4** + **shadcn/ui** (built on Base UI primitives),
  `lucide-react` icons
- **next-intl** for UI localization (App Router, no locale URL segment)
- **ts-fsrs** for spaced-repetition scheduling
- **OpenAI Realtime API** (WebRTC) for the Kruu Bingo voice avatar
- **Google Cloud Storage** storage abstraction for images and uploads (with a
  local-disk driver for development)
- **Google Cloud Translation** for captions and cross-base-language vocab
  glosses
- **Resend** for transactional email (verification, password reset)
- **pdf.js** (`pdfjs-dist`) for lesson-PDF first-page thumbnails
- **next-pwa** for the installable PWA build

## Architecture

- **App Router layout.** Routes live under `src/app`. The authenticated area is
  the `(app)` route group, and per-language pages sit under
  `language/[lang]/...` (vocab, lessons, decks, practice, settings).
- **Auth + base path.** Auth.js v5 with a credentials provider and JWT sessions
  guards the `(app)` group. In production the app is served under a sub-path, so
  client→API calls must be prefixed: use the `withBase()` helper from
  `src/lib/base-path.ts` for every `fetch('/api/...')` (Next prefixes navigation
  and assets automatically, but **not** raw fetches). Navigation paths come from
  `src/lib/routes.ts`.
- **Storage driver abstraction.** `src/lib/storage` exposes a small interface
  with two implementations — a local-disk driver for development and a Google
  Cloud Storage driver for production — selected by `STORAGE_DRIVER`. Private
  files (lesson PDFs) are served through signed URLs.
- **Per-user encrypted API keys.** Provider keys are encrypted at rest
  (`APP_ENCRYPTION_KEY`) and resolved **personal → global**: a user's own key is
  used if present, otherwise an admin-provided global key, with per-user spend
  caps enforced for metered features.
- **i18n.** next-intl resolves the locale per request from the signed-in user's
  base language, else a `NEXT_LOCALE` cookie, else `en-US`. Message catalogs
  live in `messages/{locale}.json`.
- **FSRS scheduling.** Decks and per-card review state drive a `ts-fsrs`
  scheduler supporting forward / reverse / both directions.
- **Photo-extraction pipeline.** Camera/upload → optional crop → batch extract
  via a vision model → review/edit → save. The review step is shared by the
  lesson page and the vocab page.
- **Shared vocab + roles.** Items, lessons, and tags are private by default and
  can be shared. Roles are **regular / admin / superuser**. Shared vocab is
  shown with a meaning in **your** base language: a creator's gloss is
  translated once per language (Google Cloud Translation) and reused across
  users; machine translations are flagged.

## Data model

High-level shape — see `src/db/schema.ts` for the source of truth:

- **users / user_settings / accounts / sessions** — accounts and Auth.js
  tables. `user_settings` holds per-user target & base language, encrypted
  provider keys, per-function model choices, spend caps, and voice-chat
  preferences (captions, base-language mix, speech speed). User **roles**
  (regular / admin / superuser) live on `users`.
- **global_api_keys** — admin-provided fallback provider keys for users without
  their own.
- **vocab_items** + **vocab_tags / vocab_lessons** — the vocabulary and its
  many-to-many associations to tags and lessons.
- **vocab_item_glosses** — per-base-language translations of an item's meaning,
  keyed by `(item, base_language)` so each translation is produced once and
  reused; `gloss_source` flags original vs machine.
- **tags** and **lessons** — user-owned grouping; lessons additionally carry
  attachments and links.
- **lesson_files** — uploaded lesson attachments (PDF notes). **lesson_links** —
  external resource links with a `link_category` (DLS audio / Quizlet / DLS
  exercises).
- **decks / deck_items / card_reviews / study_sessions** — flashcard decks
  (`deck_source` = tag / lesson / manual, plus card direction) and FSRS review
  state; `item_performance` tracks per-item history.
- **avatar_sessions** — voice-practice session records.
- **ai_spend_log / image_generation_batches** — consolidated AI spend tracking
  and image-generation batch state.
- **app_settings** — global, superuser-controlled settings (e.g. inactivity
  timeout).

## Local development

Prerequisites: **Node 22+**, **pnpm**, and a local **PostgreSQL** (or Docker).

```bash
git clone <this-repo>
cd language-learning-bot
pnpm install

# Configure environment
cp .env.example .env.local
# then edit .env.local (see below)

# Start a local Postgres (default dev URL targets host port 5433)
# postgresql://lang:devpassword@localhost:5433/language_learning

pnpm db:migrate     # apply Drizzle migrations
pnpm dev            # start the dev server at http://localhost:3000
```

### Environment variables

Set these in `.env.local` (never commit real values — use `<your-...>`
placeholders in any examples). Enumerated from `src/lib/env.ts` /
`.env.example`:

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string |
| `AUTH_SECRET` | yes | Auth.js session secret (≥32 bytes; `openssl rand -base64 32`) |
| `AUTH_TRUST_HOST` | dev | Trust the host header (`true` locally / behind a proxy) |
| `APP_ENCRYPTION_KEY` | yes | Key for encrypting per-user provider keys at rest (≥32 bytes) |
| `APP_URL` | yes | Public base URL (used in verification links) |
| `NEXTAUTH_URL` | yes | Auth.js callback base URL (include the base path in prod) |
| `RESEND_API_KEY` | optional | Resend key for transactional email |
| `EMAIL_FROM` | optional | Verified sender address for Resend |
| `MOCK_EMAIL` | optional | `1` to log email links to the console instead of sending |
| `NEXT_PUBLIC_BASE_PATH` | prod | Sub-path the app is served under (e.g. `/language-learning`) |
| `STORAGE_DRIVER` | yes | `local` (dev) or `gcs` (prod) |
| `LOCAL_STORAGE_DIR` | local | Directory for the local-disk storage driver |
| `GCS_BUCKET` | gcs | Bucket name (required when `STORAGE_DRIVER=gcs`) |
| `GOOGLE_APPLICATION_CREDENTIALS` | gcs | Path to the GCP service-account JSON (Storage **and** Translation) |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` | optional | Dev-only fallback provider keys |

> Per-user AI provider keys (OpenAI / Anthropic / Google) are entered in the
> app's **Settings** page and stored encrypted — they are not environment
> variables. The `*_API_KEY` env vars above are only a development fallback.

### Quality gates

```bash
pnpm lint           # eslint
pnpm test           # vitest
pnpm build          # production build (webpack)
```

Other useful scripts: `pnpm db:generate` (generate a migration from schema
changes), `pnpm db:migrate` (apply), `pnpm db:studio` (Drizzle Studio),
`pnpm test:e2e` (Playwright).

## Deployment

Deployment follows a submodule + container pattern (operational specifics live
in `DEPLOYMENT.md` and the `DEPLOY_CLAUDE.md` runbook — not here):

- The project repo is consumed as a **git submodule** of a separate
  infrastructure repo; deploying bumps the submodule pointer.
- The app is built as a **Docker** image and run on a VM, behind an **nginx**
  reverse proxy that serves it under the base path, with **Cloudflare** at the
  edge.
- **Postgres** runs in a container; pending **Drizzle migrations** are applied
  (after a backup) during deploy.
- **Google Cloud Storage** holds vocab images and uploads (and backups); the
  same service-account credential is used for Cloud Translation.

See `DEPLOYMENT.md` for the full guide and `DEPLOY_CLAUDE.md` for the
step-by-step operational runbook.
