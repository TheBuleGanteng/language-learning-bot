# CLAUDE_CODE_INSTRUCTIONS.md — Fix: OpenAI Realtime GA handshake + Lottie avatar

Read this file end-to-end before touching any code. Then read DEPLOY_CLAUDE.md
before touching the deploy steps. Execute every section in order. Do not skip
sections.

---

## CRITICAL — EXECUTION RULES

- **Do not stop early.** Complete every section including deploy, verification,
  ERROR_REPORT update, and final summary. Fix errors inline and continue.
- **Fix failures inline.** If a quality gate fails, fix and re-run from the
  top of the gate sequence before proceeding.
- **Update ERROR_REPORT.md** for every bug encountered and fixed.
- **End with a terminal summary** covering files changed, quality gates,
  deployment, and bugs resolved.
- **Deploy authority**: follow DEPLOY_CLAUDE.md exactly.
- No schema changes. No migration. Code-only.

---

## 0. ORIENTATION

Two bugs to fix in one pass:

1. **OpenAI Realtime API 400 error** — the app calls OpenAI directly from the
   browser using the raw API key (old beta pattern, now disabled). The GA API
   requires a server-side ephemeral token exchange first.

2. **Lottie avatar not rendering** — the Kruu Bingo component still uses a
   CSS placeholder. The Lottie JSON files are now in `public/animations/` and
   the component must be updated to use them.

---

## 1. AUDIT EXISTING CODE FIRST

Read these files in full before writing anything:

- `src/lib/realtime.ts` — current WebRTC client
- `src/components/avatar/kruu-bingo.tsx` — current avatar component
- `src/app/api/avatar/session-config/route.ts` — existing session-config route
  (decrypts user's OpenAI key and checks spend limits)
- `src/app/(app)/language/[lang]/decks/[deckId]/avatar/page.tsx` — avatar
  session page (how it calls realtime.ts and what props it passes)

Note exact import paths, component interfaces, and how the OpenAI key flows
from settings → session-config API → realtime.ts.

---

## 2. FIX: OPENAI REALTIME GA HANDSHAKE

### Background

The GA Realtime WebRTC flow has two steps:

**Step 1 (server-side):** Exchange the user's API key for a short-lived
ephemeral token by calling:
```
POST https://api.openai.com/v1/realtime/client_secrets
Authorization: Bearer <user-openai-api-key>
Content-Type: application/json
Body: { "model": "gpt-4o-realtime-preview", "voice": "alloy" }
```
This returns `{ client_secret: { value: "<ephemeral-token>", expires_at: ... } }`.

**Step 2 (client-side):** Use the ephemeral token (NOT the raw API key) to
POST the SDP offer to:
```
POST https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview
Authorization: Bearer <ephemeral-token>
Content-Type: application/sdp
Body: <SDP offer>
```

This keeps the raw API key server-side only and uses the short-lived token
in the browser.

### 2a. Create new server-side API route

Create `src/app/api/avatar/token/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { userSettings } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { decryptString } from '@/lib/crypto'
import { checkSpendLimits } from '@/lib/cost-tracking'

const REALTIME_MODEL = 'gpt-4o-realtime-preview'
const VOICE = 'alloy'

export async function POST(req: Request) {
  const session = await auth()
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check spend limits
  const limits = await checkSpendLimits(userId)
  if (limits.hardStopTriggered) {
    return NextResponse.json({ error: 'hard_stop' }, { status: 402 })
  }

  // Get user's OpenAI key
  const [settings] = await db
    .select({ openaiKey: userSettings.openaiApiKeyEncrypted })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1)

  if (!settings?.openaiKey) {
    return NextResponse.json({ error: 'no_openai_key' }, { status: 402 })
  }

  let apiKey: string
  try {
    apiKey = decryptString(settings.openaiKey)
  } catch {
    return NextResponse.json({ error: 'key_decrypt_failed' }, { status: 500 })
  }

  // Exchange for ephemeral token server-side
  try {
    const tokenRes = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: REALTIME_MODEL,
        voice: VOICE,
      }),
    })

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text()
      console.error('OpenAI client_secrets error:', tokenRes.status, errBody)
      return NextResponse.json(
        { error: 'openai_error', status: tokenRes.status },
        { status: 502 }
      )
    }

    const data = await tokenRes.json()
    const ephemeralToken = data?.client_secret?.value
    if (!ephemeralToken) {
      return NextResponse.json({ error: 'no_token' }, { status: 502 })
    }

    // Return only the ephemeral token — never return the raw API key
    return NextResponse.json({
      ephemeralToken,
      model: REALTIME_MODEL,
      warning: limits.warningTriggered ? {
        monthlySpend: limits.monthlySpend,
        warningLimit: limits.warningLimit,
      } : undefined,
    })
  } catch (err) {
    console.error('Token exchange error:', err)
    return NextResponse.json({ error: 'token_exchange_failed' }, { status: 500 })
  }
}
```

### 2b. Update `src/lib/realtime.ts`

The `RealtimeSessionConfig` interface currently accepts `openaiApiKey`. Replace
this with `ephemeralToken` — the raw key must never reach the browser.

Change the interface:
```ts
// REMOVE:
openaiApiKey: string

// ADD:
ephemeralToken: string
```

Update the `start()` method — the SDP POST should use `this.config.ephemeralToken`
instead of `this.config.openaiApiKey`:

```ts
const res = await fetch(
  `https://api.openai.com/v1/realtime?model=${encodeURIComponent(REALTIME_MODEL)}`,
  {
    method: 'POST',
    body: offer.sdp,
    headers: {
      Authorization: `Bearer ${this.config.ephemeralToken}`,
      'Content-Type': 'application/sdp',
    },
  }
)
```

Remove `REALTIME_URL` constant if it only existed for the old direct call
(it's now inlined above or can remain as a constant — clean up as appropriate).

### 2c. Update the avatar page

Read `src/app/(app)/language/[lang]/decks/[deckId]/avatar/page.tsx` carefully.

Currently the page fetches from `/api/avatar/session-config` which returns the
decrypted API key. Update the page to instead:

1. On mic button tap (user gesture), call `POST /api/avatar/token` (the new
   route from §2a) — use `withBase('/api/avatar/token')`
2. On success, pass `ephemeralToken` to `new RealtimeSession({ ephemeralToken, ... })`
3. Handle the error cases from the token endpoint:
   - `error: 'no_openai_key'` → show the existing no-key dialog
   - `error: 'hard_stop'` → show the existing hard-stop dialog  
   - `error: 'openai_error'` → show sonner toast "Could not connect to OpenAI.
     Check your API key in Settings."
   - Network error → show sonner toast "Connection failed. Please try again."

The existing `/api/avatar/session-config` call (which was fetching the key for
the old flow) should be removed or repurposed. If it was also used to pre-check
spend limits on page load, keep that behaviour but have it NOT return the API
key — instead just return `{ hasKey: boolean, warning?, hardStop? }`.

Review carefully what `session-config` currently returns and adjust accordingly
so spend limit checking on page load still works without returning the raw key.

---

## 3. FIX: LOTTIE AVATAR COMPONENT

Read `src/components/avatar/kruu-bingo.tsx` in full before editing.

The component currently renders a CSS placeholder (smiley face or pulsing
circle). Replace it with the real Lottie animations.

### 3a. Update the component

```tsx
'use client'

import Lottie from 'lottie-react'
import idleAnimation from '../../../public/animations/kruu-bingo-idle.json'
import speakingAnimation from '../../../public/animations/kruu-bingo-speaking.json'
import listeningAnimation from '../../../public/animations/kruu-bingo-listening.json'

type AvatarState = 'idle' | 'speaking' | 'listening'

interface KruuBingoProps {
  state: AvatarState
  size?: number
}

export function KruuBingo({ state, size = 200 }: KruuBingoProps) {
  const animation =
    state === 'speaking'
      ? speakingAnimation
      : state === 'listening'
        ? listeningAnimation
        : idleAnimation

  return (
    <div
      style={{ width: size, height: size }}
      aria-label="Kruu Bingo, your Thai language tutor"
      role="img"
    >
      <Lottie
        animationData={animation}
        loop
        autoplay
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  )
}
```

**Import path note**: adjust the relative import path to match the actual
location of the component file. If `public/` is not reachable via relative
import, import via `@/` alias: `import idleAnimation from '@/public/animations/kruu-bingo-idle.json'`
— or whichever alias resolves to the project root. Check `tsconfig.json` for
the correct path alias before writing the import.

**TypeScript note**: if the project does not have `resolveJsonModule: true` in
`tsconfig.json`, add it. Check before assuming it's there.

### 3b. Verify lottie-react is installed

```bash
grep lottie-react package.json
```

If not present: `pnpm add lottie-react`

---

## 4. QUALITY GATES

Run in order. All must pass before committing. Fix and re-run from the top if
any fail.

```bash
pnpm lint
pnpm test
pnpm build
```

Note: `pnpm build` may hang at "Collecting page data" locally (known pre-existing
issue — DB not reachable at build time). If it compiles successfully before
hanging, that is acceptable. Kill with Ctrl+C after seeing "Compiled
successfully" and proceed to commit.

---

## 5. DEPLOY

Follow **DEPLOY_CLAUDE.md** exactly:
- Commit and push project repo (Step 3) — stage only modified files, never
  `git add -A`
- Bump submodule pointer (Step 4)
- Deploy on VM (Step 5)
- Verify (Step 6)

No migration needed — code-only change.

---

## 6. UPDATE ERROR_REPORT.md

Append entries for both bugs fixed:

```
## YYYY-MM-DD — OpenAI Realtime API 400: beta endpoint disabled
**Symptom**: POST /v1/realtime returned 400 "beta_api_shape_disabled"
**Root cause**: GA Realtime API requires server-side ephemeral token exchange
  via /v1/realtime/client_secrets before client-side WebRTC handshake. The
  old beta pattern of calling /v1/realtime directly from the browser with the
  raw API key is no longer supported.
**Fix**: Added /api/avatar/token server-side route to exchange the user's
  encrypted API key for an ephemeral token. Updated realtime.ts to accept
  ephemeralToken instead of openaiApiKey. Updated avatar page to call the
  token endpoint on mic tap.

## YYYY-MM-DD — Kruu Bingo avatar showing CSS placeholder instead of Lottie
**Symptom**: Avatar page showed smiley face CSS placeholder
**Root cause**: kruu-bingo.tsx was never updated from placeholder to use the
  Lottie JSON files added to public/animations/
**Fix**: Updated KruuBingo component to import and render Lottie animations
  for idle/speaking/listening states.
```

Commit ERROR_REPORT.md and bump submodule per DEPLOY_CLAUDE.md Steps 3 and 4.

---

## 7. FINAL TERMINAL SUMMARY

Print a summary covering:
- Files created and modified
- Quality gates: lint / test / build — pass or fail and what was fixed
- Deployment: confirmed deployed and verified
- Both bugs resolved

---

## 8. POST-DEPLOY SMOKE TEST CHECKLIST

- [ ] Avatar page loads — Kruu Bingo Lottie animation visible (not smiley face)
- [ ] Animation switches between idle / listening / speaking states correctly
- [ ] Tapping mic button triggers `POST /api/avatar/token` (check network tab)
- [ ] Token endpoint returns 200 with ephemeralToken (not the raw API key)
- [ ] WebRTC handshake completes — no 400 error from OpenAI
- [ ] Kruu Bingo speaks the greeting
- [ ] Speaking into mic shows transcript
- [ ] No raw API key visible anywhere in browser network tab requests
- [ ] If OpenAI key not set: no-key dialog appears
- [ ] If spend limit hit: hard-stop dialog appears