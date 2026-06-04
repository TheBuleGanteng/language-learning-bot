# Kaojai — language-learning bot

Kaojai is a self-hosted, multi-user web app for learning a language with **your
own** vocabulary. You curate the words you care about (typed in, imported, or
extracted from photos), study them with spaced-repetition flashcards, and
practice them out loud with an AI voice tutor — "Kruu Bingo" — that knows what's
in your decks. The whole UI is multilingual, with a per-user base language.

> The target language is currently Thai; the base-language / UI locale can be
> English, Simplified or Traditional Chinese, Korean, or Bahasa Indonesia.

## Features

- **Vocabulary management** — create, edit, tag, and organize vocab items;
  per-item example sentences, transliteration, and notes; private-by-default
  with optional sharing.
- **AI image generation** — illustrate vocab items with a configurable image
  model (Google Imagen / OpenAI), with per-user monthly spend caps.
- **Photo OCR extraction** — upload photos of a textbook/notes and a
  vision-capable model extracts candidate vocab for review and saving.
- **Shared vocab + role-based admin** — share items/lessons/tags; regular /
  admin / superuser roles.
- **Flashcards with FSRS** — spaced-repetition study built on `ts-fsrs`, with
  forward / reverse / both directions and per-deck scheduling.
- **AI voice tutor "Kruu Bingo"** — real-time spoken practice over the OpenAI
  Realtime API (WebRTC). Two modes: **deck practice** (grounded in a deck's
  vocab) and **free conversation** (open-ended, not tied to a deck).
- **Voice-chat captions** — live transcript with base-language (translated),
  target-language, or romanized-target modes.
- **Base-language-use & speech-speed controls** — sliders that tune how much of
  your base language the tutor mixes in and how fast it speaks; both apply live
  mid-session.
- **Home hub** — a landing page with quick tiles into practice and vocabulary.
- **Per-user encrypted API keys + per-function model selection** — bring your
  own OpenAI / Anthropic / Google keys (stored encrypted at rest); choose the
  model that powers each AI feature.
- **Multi-language UI (i18n)** — the interface is localized into 5 locales with
  a per-user base language. Shared vocab is shown with a meaning in **your**
  base language: a creator's gloss is translated once per language (Google Cloud
  Translation) and reused across all users; machine translations are flagged.

## Tech stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4** + **shadcn/ui** (Base UI primitives), `lucide-react`
- **PostgreSQL** + **Drizzle ORM** (migrations in `src/db/migrations`)
- **Auth.js v5** (credentials, JWT sessions) with email verification
- **Resend** for transactional email (verification, password reset)
- **Google Cloud Storage** for vocab images and uploads
- **OpenAI Realtime API** (WebRTC) for the Kruu Bingo voice tutor
- **ts-fsrs** for spaced-repetition scheduling
- **Google Cloud Translation** for captions and cross-base-language vocab glosses
- **next-intl** for UI localization (App Router, no locale URL segment)
- **next-pwa** for the installable PWA build

## Local development

Prerequisites: Node 22+, **pnpm**, and a local PostgreSQL (or Docker).

```bash
pnpm install

# Configure environment (see below) in .env.local
# Start a local Postgres
# (default dev URL: postgresql://lang:devpassword@localhost:5433/language_learning)

pnpm db:migrate     # apply Drizzle migrations
pnpm dev            # start the dev server (http://localhost:3000)
```

Useful scripts:

```bash
pnpm lint           # eslint
pnpm test           # vitest
pnpm build          # production build (webpack)
pnpm db:generate    # generate a migration from schema changes
pnpm db:migrate     # apply migrations
pnpm db:studio      # Drizzle Studio
```

### Environment variables

Set these in `.env.local` (never commit real values):

- `DATABASE_URL` — Postgres connection string
- `AUTH_SECRET` — Auth.js session secret
- `APP_ENCRYPTION_KEY` — key for encrypting per-user API keys at rest
- `APP_URL` — public base URL (used in verification links)
- `RESEND_API_KEY` — Resend API key (transactional email)
- `GOOGLE_APPLICATION_CREDENTIALS` — path to the GCP service-account JSON used
  for Cloud Storage **and** Cloud Translation
- `NEXT_PUBLIC_BASE_PATH` — optional sub-path when served under one (e.g.
  `/language-learning`)

Per-user AI provider keys (OpenAI / Anthropic / Google) are entered in the app's
Settings page and stored encrypted — they are not environment variables.

## Database overview

High-level shape (see `src/db/schema.ts` for the source of truth):

- **users / user_settings** — accounts, roles, target & base language, per-user
  encrypted provider keys, per-function model choices, spend caps, voice-chat
  preferences (captions, base-language-use, speech-speed). `native_language`
  holds the user's base-language **locale**.
- **vocab_items** + **vocab_tags / vocab_lessons** — the vocabulary and its
  associations; `native_language` pins the language the meaning is written in.
- **vocab_item_glosses** — per-base-language translations of an item's meaning,
  keyed by `(item, base_language)` so a translation is produced once and reused.
- **lessons / lesson_files / lesson_links** — lesson content and attachments.
- **decks / deck_items / card_reviews / study_sessions** — flashcard decks and
  FSRS state.
- **avatar_sessions / ai_spend_log** — voice-practice records and consolidated
  AI spend tracking.
- **app_settings** — global, superuser-controlled settings (e.g. inactivity
  timeout).

## Internationalization

next-intl runs **without a locale URL segment**: the active locale is resolved
per request from (1) the signed-in user's base language, else (2) a
`NEXT_LOCALE` cookie (used pre-auth and on the sign-up page), else (3) the
`en-US` default. The header has a language selector (also shown on the auth
pages); changing it persists to the user's account and re-renders the UI
immediately. New accounts inherit the locale the sign-up page was using.

Message catalogs live in `messages/{locale}.json`. Cross-base-language vocab
glosses are display-only (search still operates on the original text).

## Deployment (conceptual)

Local work (build, test, push) and production deploy are handled by three
checked-in handoff documents that Claude Code follows:

- a **local build** spec — implement, run local migrations, build/test, push to
  GitHub;
- a **deploy** spec — bump this project as a git **submodule** of a separate
  `vm-infrastructure` repo, then pull/build/restart on the server;
- a **notification** spec — email a build/deploy summary via Resend.

Production runs on a GCP VM behind **Cloudflare → nginx → Docker**, with Postgres
in a container and pending Drizzle migrations applied automatically (after a
backup) during deploy. Infrastructure specifics (hosts, secrets, credential
paths) are intentionally kept out of this repo.
