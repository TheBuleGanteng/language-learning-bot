# Vocab Image Generation — Build Instructions

> Adds AI-generated cartoon images to vocab items. Foundational work for flashcards later. Work in order, commit per section, push to origin/main at end.

## Context

Base is `main`, post-UI-polish-pass-3. This adds:

1. Image generation provider abstraction (OpenAI GPT-Image, Google Imagen 4)
2. Schema additions for per-vocab image state
3. Settings page: split "LLM provider" into "Chat Model" and "Image Model"; add cost-cap configuration
4. Cost tracking with monthly reminder bands and hard stop
5. Selection mode on vocab list with bulk image generation flow
6. Thumbnails in vocab tables; click to expand
7. Per-item regenerate + advanced prompt override on vocab edit page

Project path: `/home/thebuleganteng/01_Repos/06_personal_work/language-learning-bot`
Branch: `main`

---

## Section 1 — Schema additions

### 1.1 Update `vocab_items`

Add these columns to `src/db/schema.ts`:

```ts
imageStorageKey: text('image_storage_key'),
imageGeneratedAt: timestamp('image_generated_at', { withTimezone: true }),
imageStatus: text('image_status').notNull().default('none'),
  // check: 'none' | 'generating' | 'completed' | 'refused' | 'failed'
imagePrompt: text('image_prompt'),         // actual prompt that was sent
imagePromptOverride: text('image_prompt_override'),  // user-customized prompt
imageProvider: text('image_provider'),     // 'openai' | 'google'
imageModel: text('image_model'),            // e.g., 'imagen-4-fast'
```

Add a CHECK constraint on `imageStatus` for the five allowed values.

### 1.2 New `image_generation_log` table

```ts
export const imageGenerationLog = pgTable('image_generation_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  vocabItemId: uuid('vocab_item_id').references(() => vocabItems.id, { onDelete: 'set null' }),
  // nullable: keep historical cost log even if vocab is later deleted
  provider: text('provider').notNull(),     // 'openai' | 'google'
  model: text('model').notNull(),
  estimatedCostUsd: numeric('estimated_cost_usd', { precision: 10, scale: 6 }).notNull(),
  status: text('status').notNull(),         // 'success' | 'failed' | 'refused'
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userMonthIdx: index('img_gen_log_user_month_idx').on(t.userId, t.createdAt),
}));
```

The index supports the monthly-spend aggregation query.

### 1.3 Update `user_settings`

Add these columns to the existing `user_settings` table:

```ts
imageProvider: text('image_provider').notNull().default('google'),
imageModel: text('image_model').notNull().default('imagen-4-fast'),
imageSpendReminderUsd: numeric('image_spend_reminder_usd', { precision: 8, scale: 2 })
  .notNull().default('25'),
imageSpendHardStopUsd: numeric('image_spend_hard_stop_usd', { precision: 8, scale: 2 })
  .notNull().default('100'),
imageSpendLastReminderAt: numeric('image_spend_last_reminder_at', { precision: 8, scale: 2 }),
  // The dollar threshold at which the last reminder was shown for the current month.
  // Cleared (NULL) at the start of each new month. Used to ensure each $X band only
  // triggers the reminder once.
```

### 1.4 Generate + apply migrations

```bash
pnpm db:generate
pnpm db:migrate
```

Verify the migration ran cleanly. Check that existing vocab items still load (the new columns are nullable / have defaults).

### 1.5 Section commit

```
feat(db): vocab image state, image generation log, and per-user image spend settings
```

---

## Section 2 — Image generation provider abstraction

### 2.1 Interface

Create `src/lib/image-gen/types.ts`:

```ts
export interface ImageGenRequest {
  prompt: string;
  // The vocab's native language word/phrase, e.g. "to eat".
  // Image gen models are most reliable in English; we pass the English (native_text)
  // and rely on the standard prompt template to handle context.
}

export interface ImageGenResult {
  status: 'success' | 'refused' | 'failed';
  imageBuffer?: Buffer;            // PNG bytes; present when status='success'
  contentType?: string;            // 'image/png'
  errorMessage?: string;           // present when status='refused' or 'failed'
  rawProviderResponse?: unknown;   // for debugging
}

export interface ImageGenProvider {
  readonly providerId: string;
  readonly modelId: string;
  readonly estimatedCostUsd: number;   // per image
  generate(req: ImageGenRequest): Promise<ImageGenResult>;
}
```

### 2.2 Google Imagen provider

Create `src/lib/image-gen/google.ts`:

- Uses `@google/genai` SDK
- The user's `GEMINI_API_KEY` (decrypted from `user_settings`) is passed in at construction
- Supported model IDs: `imagen-4-fast`, `imagen-4-standard`, `imagen-4-ultra`
- API: `genai.models.generateImages({ model: 'models/imagen-4.0-fast-generate-001', prompt, config: { numberOfImages: 1, aspectRatio: '1:1' } })` — check current SDK syntax; this may have shifted
- Map status codes:
  - 200 + image → `success`
  - 400 with safety filter / content policy → `refused`
  - 500 / network / other → `failed`

Install: `pnpm add @google/genai`

### 2.3 OpenAI GPT-Image provider

Create `src/lib/image-gen/openai.ts`:

- Uses `openai` npm SDK
- Supported model IDs: `gpt-image-1-mini`, `gpt-image-1.5-low`, `gpt-image-1.5-standard`, `gpt-image-1.5-high`
- API: `openai.images.generate({ model, prompt, size: '1024x1024', quality, n: 1 })` — quality maps to the tier
- `quality` parameter for `gpt-image-1.5`: 'low' | 'medium' | 'high'. Response includes a base64 string; decode to Buffer.
- Map content policy refusals to `refused`; other errors to `failed`

Install: `pnpm add openai` (if not already; the project may already have it from elsewhere)

### 2.4 Model catalog with pricing

Create `src/lib/image-gen/catalog.ts`:

```ts
export const IMAGE_MODELS = {
  google: [
    { id: 'imagen-4-fast', label: 'Imagen 4 Fast (recommended)', costUsd: 0.02, isDefault: true },
    { id: 'imagen-4-standard', label: 'Imagen 4 Standard', costUsd: 0.04 },
    { id: 'imagen-4-ultra', label: 'Imagen 4 Ultra (highest quality)', costUsd: 0.06 },
  ],
  openai: [
    { id: 'gpt-image-1-mini', label: 'GPT-Image 1 Mini (cheapest)', costUsd: 0.005 },
    { id: 'gpt-image-1.5-low', label: 'GPT-Image 1.5 Low', costUsd: 0.011 },
    { id: 'gpt-image-1.5-standard', label: 'GPT-Image 1.5 Standard', costUsd: 0.04 },
    { id: 'gpt-image-1.5-high', label: 'GPT-Image 1.5 High (premium)', costUsd: 0.167 },
  ],
} as const;

export type ImageProvider = keyof typeof IMAGE_MODELS;

export function imageModelCost(provider: ImageProvider, modelId: string): number {
  const list = IMAGE_MODELS[provider] ?? [];
  return list.find(m => m.id === modelId)?.costUsd ?? 0;
}

export function defaultImageModel(provider: ImageProvider): string {
  const list = IMAGE_MODELS[provider] ?? [];
  return (list.find(m => 'isDefault' in m && m.isDefault) ?? list[0]).id;
}
```

In README, note: "Image generation pricing as of May 2026; verify on provider sites before deployment."

### 2.5 Factory

Create `src/lib/image-gen/index.ts`:

```ts
import { GoogleImagenProvider } from './google';
import { OpenAIImageProvider } from './openai';
import { imageModelCost } from './catalog';
import type { ImageGenProvider, ImageProvider } from './types';

export function makeImageProvider(args: {
  provider: ImageProvider;
  model: string;
  apiKey: string;
}): ImageGenProvider {
  if (args.provider === 'google') {
    return new GoogleImagenProvider({
      apiKey: args.apiKey,
      modelId: args.model,
      estimatedCostUsd: imageModelCost('google', args.model),
    });
  }
  if (args.provider === 'openai') {
    return new OpenAIImageProvider({
      apiKey: args.apiKey,
      modelId: args.model,
      estimatedCostUsd: imageModelCost('openai', args.model),
    });
  }
  throw new Error(`Unknown image provider: ${args.provider}`);
}
```

### 2.6 The standard prompt

Create `src/lib/image-gen/prompt.ts`:

```ts
export function buildImagePrompt(args: {
  nativeText: string;            // English word/phrase
  targetLanguageName: string;    // e.g., "Thai" — for context only
  override?: string | null;      // user-provided custom prompt
}): string {
  if (args.override && args.override.trim()) {
    // User has provided a custom prompt. Still wrap it with the no-text rule.
    return `${args.override.trim()}\n\nStyle: clean cartoon illustration, square aspect ratio, centered subject, simple background. NO text, letters, words, numbers, or signs of any kind in the image.`;
  }

  return `Generate a simple, friendly cartoon illustration depicting the concept of:
"${args.nativeText}" (vocabulary word for a learner of ${args.targetLanguageName})

Style requirements:
- Clean cartoon illustration
- Vivid colors but not garish
- Centered subject, white or simple background
- Square aspect ratio (1:1)
- NO text, letters, words, numbers, or signs of any kind in the image
- Concrete visual depiction, even for abstract concepts
- Neutral and inclusive depiction of people if applicable (no gender, ethnic, or age stereotypes)
- Family-friendly content

The image should help a language learner remember this word.`;
}
```

### 2.7 Section commit

```
feat(image-gen): provider abstraction, model catalog, and standard prompt template
```

---

## Section 3 — Storage updates for public-but-unguessable URLs

### 3.1 Current state

The existing storage abstraction (`src/lib/storage/`) has a local FS provider and a GCS provider. Both currently use signed URLs (GCS) or auth-gated routes (local) for read access.

### 3.2 Change for images specifically

Vocab images are non-sensitive and benefit from long-lived, cacheable URLs. Add a new method to the storage interface for "publishable" objects:

```ts
// Add to StorageProvider interface in src/lib/storage/types.ts
putPublic(key: string, data: Buffer, contentType: string): Promise<FileMetadata>;
// Stores at a publicly-readable URL (unguessable path). Used for vocab images only.
// Local FS: same as put(), URL routes through /api/files/[...path] but auth check is skipped
// when the key starts with "public/".
// GCS: uploads with public ACL; returns the direct https URL (no signing).
```

### 3.3 Local implementation

In `src/lib/storage/local.ts`:
- Add `putPublic`: writes to `{baseDir}/public/{key}` (note the `public/` prefix). Returns metadata with `url = /api/files/public/{key}` (no auth check needed when path starts with `public/`).
- In `src/app/api/files/[...path]/route.ts`: if the first path segment is `public`, skip the user-auth check. The path-traversal protection still applies.

### 3.4 GCS implementation

In `src/lib/storage/gcs.ts`:
- Add `putPublic`: uploads to bucket with `metadata: { cacheControl: 'public, max-age=31536000' }` and calls `file.makePublic()`. Returns metadata with `url = https://storage.googleapis.com/{bucket}/{key}`.
- Note: requires the GCS bucket to allow public objects (default does for fine-grained access). If uniform bucket-level access is enabled, this fails — README must note this requirement.

### 3.5 Key naming for vocab images

```
public/users/{userId}/vocab/{vocabId}/{randomId}.png
```

The `randomId` is a fresh UUID per image, so regenerating a vocab image produces a new URL (browsers don't show a stale cached version). The old image's file is deleted as part of regenerate.

### 3.6 Documentation

In README, update GCS setup section:

> Public image objects: for vocab image URLs to be cacheable and long-lived, the bucket must allow public read on individual objects. Either:
> - (Option 1) Use fine-grained ACLs (the default) and call `file.makePublic()` on each image — already wired in
> - (Option 2) If you want bucket-uniform access, make the entire `public/` prefix readable via IAM:
>   ```
>   gsutil iam ch allUsers:objectViewer gs://kebayoran-language-learning-bot/public
>   ```

### 3.7 Section commit

```
feat(storage): add putPublic for non-sensitive cacheable URLs (vocab images)
```

---

## Section 4 — Cost tracking and enforcement

### 4.1 Monthly spend query

Create `src/lib/cost-tracking.ts`:

```ts
import { db } from '@/db';
import { imageGenerationLog } from '@/db/schema';
import { sql, and, eq, gte, ne } from 'drizzle-orm';

export async function getMonthToDateImageSpend(userId: string): Promise<number> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const result = await db
    .select({
      total: sql<string>`COALESCE(SUM(${imageGenerationLog.estimatedCostUsd}), 0)`,
    })
    .from(imageGenerationLog)
    .where(
      and(
        eq(imageGenerationLog.userId, userId),
        gte(imageGenerationLog.createdAt, monthStart),
        ne(imageGenerationLog.status, 'failed'),
        // Don't charge for outright failures; do charge for refusals (the provider was called)
      ),
    );
  return Number(result[0]?.total ?? 0);
}
```

### 4.2 Hard-stop enforcement

Before any image generation call, check:

```ts
const spend = await getMonthToDateImageSpend(userId);
const settings = await getUserSettings(userId);
const hardStop = Number(settings.imageSpendHardStopUsd);
const modelCost = imageModelCost(settings.imageProvider, settings.imageModel);

if (spend + modelCost > hardStop) {
  throw new HardStopExceededError(spend, hardStop);
}
```

A custom error class so API routes can return a proper 402-style response:

```ts
export class HardStopExceededError extends Error {
  constructor(public currentSpend: number, public hardStop: number) {
    super(`Image generation blocked: monthly hard stop ($${hardStop}) reached. Current spend: $${currentSpend.toFixed(2)}.`);
  }
}
```

API handlers return HTTP 402 (Payment Required — semantically apt) with a clear JSON body:

```json
{
  "error": "hard_stop_exceeded",
  "currentSpend": 100.06,
  "hardStop": 100.00,
  "message": "You've reached your monthly image-generation hard stop of $100. Raise it in Settings, or wait until the first of next month."
}
```

The frontend catches 402 specifically and shows a modal directing the user to Settings.

### 4.3 Reminder band logic

The default reminder is $25. The user-visible behavior: "show a banner each time the user crosses another $25 worth of image-gen spend this month."

So if reminder = $25, the user gets banners at $25, $50, $75, $100 (subject to hard stop also being hit).

Logic:

```ts
async function checkAndShowReminder(userId: string) {
  const settings = await getUserSettings(userId);
  const reminder = Number(settings.imageSpendReminderUsd);
  if (reminder <= 0) return null;

  const spend = await getMonthToDateImageSpend(userId);
  const currentBand = Math.floor(spend / reminder) * reminder;

  const lastBand = Number(settings.imageSpendLastReminderAt ?? 0);

  if (currentBand > lastBand && currentBand > 0) {
    // Crossed into a new band; update and return the message
    await db.update(userSettings).set({
      imageSpendLastReminderAt: String(currentBand),
    }).where(eq(userSettings.userId, userId));
    return {
      band: currentBand,
      currentSpend: spend,
    };
  }
  return null;
}
```

Reset on month change: a separate utility that checks the current month vs. the month of `imageSpendLastReminderAt` storage and zeros it if changed. Run this lazily — on first cost query of each session.

Actually, simpler approach: store `imageSpendLastReminderAt` as a structured value with the month: `"2026-05:25.00"`. On read, if the month prefix doesn't match current month, treat as 0. This avoids needing a separate reset job.

Refine the column:

```ts
imageSpendLastReminderAt: text('image_spend_last_reminder_at'),
// Format: "{YYYY-MM}:{amount}". Examples: "2026-05:25.00", "2026-05:50.00"
// Null until the first reminder fires this month.
```

And the band logic uses this composite format.

### 4.4 Where reminders surface

Two places:

1. **In the bulk generation cost-preview modal** (Section 6): the modal shows "Estimated cost: $X.XX. After this, your month-to-date spend will be $Y.YY of $Z hard stop." If $Y >= the next reminder band, append "(this will trigger a reminder)."

2. **After successful generation** (single or bulk): if a new reminder band was crossed, surface a toast: "You've spent $50 on image generation this month."

Reminders don't block; they only inform.

### 4.5 API: get spend summary

`/api/settings/image-spend` GET — returns:

```json
{
  "currentSpend": 12.34,
  "hardStop": 100.00,
  "reminder": 25.00,
  "lastReminderBand": 0,
  "nextReminderBand": 25.00,
  "monthLabel": "May 2026",
  "provider": "google",
  "model": "imagen-4-fast",
  "estimatedCostPerImage": 0.02
}
```

The settings page uses this to show the current spend status.

### 4.6 Section commit

```
feat(cost): monthly image-spend tracking, reminder bands, and hard-stop enforcement
```

---

## Section 5 — Settings page updates

### 5.1 Rename "LLM provider" → "Chat Model"

In the settings page, change the section title "LLM provider" to **"Chat Model"**. Description text update: *"Choose which model the AI tutor uses for chat. Each user can pick independently."*

The provider and model dropdowns are unchanged; just the section title.

### 5.2 New section: "Image Model"

Below the Chat Model section, add a new section titled **"Image Model"**:

> Description: "Choose which model generates illustrations for your vocabulary."

Two dropdowns:
- **Provider**: Google, OpenAI (no Anthropic — they don't have image gen)
- **Model**: populated from `IMAGE_MODELS[selectedProvider]`, default selected per `defaultImageModel(provider)`

When the user changes provider, auto-set the model to that provider's default.

Auto-save on change (per the existing UI polish for the chat settings).

Below the dropdowns, show: *"Estimated cost: $X.XX per image"* — pulled from the `IMAGE_MODELS` catalog.

If the user has no API key for the selected provider, show a warning: *"You haven't entered an API key for {Provider}. Add one below to use this model."*

### 5.3 New section: "Image generation budget"

Below the Image Model section:

> Description: "Set monthly spending controls for image generation. Estimated based on provider price-per-image. Resets on the 1st of each calendar month."

Two inputs:
- **Reminder every** [$ input] — default `$25`. Description: *"Show a banner each time your month-to-date spend crosses this amount."*
- **Hard stop at** [$ input] — default `$100`. Description: *"Block further image generation when month-to-date spend reaches this amount."*

Validation: reminder must be ≥ $1, hard stop must be ≥ reminder.

Auto-save on blur (not on every keystroke).

Below the inputs, show the current state:

> Month to date: $12.34 spent of $100 hard stop · Next reminder at $25 · 617 images possible at current model price

The "X images possible" number is `(hardStop - currentSpend) / estimatedCostPerImage`, rounded down. Useful gut-check.

### 5.4 Section commit

```
feat(settings): split chat/image model sections; add image-spend budget controls
```

---

## Section 6 — Vocab page: selection mode + bulk generate

### 6.1 The "Generate Images" button

On the vocab list page (`/language/[lang]/vocab`), add a button in the top toolbar:

```
[+ Add vocab] [📥 Import CSV] [🖼️ Generate Images]
```

Default state: not in selection mode. Click → enters selection mode.

### 6.2 Selection mode UI

When selection mode is active:

1. **Each row gets a checkbox** on the leftmost column
2. **A persistent action bar** appears at the top of the table (sticky):

```
[N selected] [Select all visible] [Clear selection] [Generate Images for N]  [Cancel]
```

3. **Items without an image (status = 'none' or 'failed')** are selectable
4. **Items with status = 'completed'** are also selectable (regenerate semantics)
5. **Items currently generating (status = 'generating')** are NOT selectable (disable checkbox + show a spinner badge)
6. **Items with status = 'refused'** are selectable but show a visual indicator the previous attempt was refused

The filter sidebar (Lessons, Themes) remains functional — selecting a lesson narrows the list, and "Select all visible" only selects within the narrowed list.

Tag-based filtering inside selection mode is the natural way users would pick "all food vocab" or "Lesson 12 only" or "everything that doesn't have an image yet."

### 6.3 Add an "Image status" filter

To support the common case of "generate images for everything that doesn't have one yet," add a new filter row above the table:

```
Image status: [All] [Has image] [No image] [Failed/refused]
```

This filter is independent of the lessons/themes accordion filters.

When in selection mode, "No image" is the most useful default. Consider auto-applying this filter when entering selection mode (with a "Show all" link to override).

### 6.4 The cost preview modal

Clicking "Generate Images for N" opens a confirmation modal:

```
┌─ Generate images ─────────────────────────────┐
│                                                │
│ You're about to generate 247 images.           │
│                                                │
│ Provider: Google Imagen 4 Fast                 │
│ Cost per image: $0.02                          │
│ Estimated total cost: $4.94                    │
│                                                │
│ Month-to-date spend:    $12.34                 │
│ After this generation:  $17.28                 │
│ Monthly hard stop:      $100.00                │
│                                                │
│ ⚠ This will trigger a reminder at $25.         │
│                                                │
│ Images will be generated in the background.    │
│ You'll see progress on this page.              │
│                                                │
│              [Cancel] [Generate 247 images]    │
└────────────────────────────────────────────────┘
```

If "after this generation" would exceed the hard stop:

```
Cannot generate: this batch would exceed your monthly hard stop.
Items to generate:    247 ($4.94)
Items affordable:     34 ($0.68)
Or [Raise hard stop in Settings]
```

With a button to "Generate the 34 affordable ones" or "Cancel."

### 6.5 Bulk generation execution

Once confirmed:

1. POST `/api/vocab/generate-images` with `{ vocabIds: [...] }`
2. Server marks all selected vocab items as `imageStatus = 'generating'`
3. Server enqueues generation jobs (see 6.6 below)
4. Modal closes, returns to vocab page
5. Selection mode exits; selected items now show "generating..." badges on their thumbnails
6. The page polls `/api/vocab/generation-status` every 5 seconds while any items are generating; updates the UI as each completes

A progress bar at the top of the page during bulk runs:

```
Generating images: 47 of 247 complete · 3 failed · [Stop]
```

The "Stop" button doesn't kill in-flight requests (race condition), but marks future queued items as cancelled.

### 6.6 Server-side execution model

This is meaningful: image gen takes 5-15 seconds per image. Synchronous request blocking is not viable for batches.

For v1, **don't use a real job queue** (BullMQ, etc.). Instead:

- The POST handler returns immediately after marking items as `'generating'`
- It also kicks off an `async function processBatch()` that runs in the background (within the Next.js server process)
- The function loops through items sequentially (or with a small concurrency limit of 2-3), calling the provider, storing the image, and updating the DB row
- Status updates are visible to the client via the polling endpoint
- If the Next.js process restarts mid-batch, items left as `'generating'` are stuck — on user request to the page, a cleanup query resets items where `imageStatus = 'generating' AND updated_at < NOW() - INTERVAL '5 minutes'` back to `'none'`

Document in `ERROR_REPORT.md`: "Bulk image generation runs in-process; not safe across server restarts. A real job queue (BullMQ + Redis) would be the next step if bulk runs become long enough to span restarts."

For your scale (~2000 images max in a batch, ~$40), this in-process approach is fine. A 2000-image batch at 8-second average per image with concurrency 3 is ~90 minutes.

### 6.7 Section commit

```
feat(vocab): selection mode and bulk image generation with cost preview
```

---

## Section 7 — Single-item image generation and display

### 7.1 Vocab edit page: image controls

On the per-vocab edit page (likely `/language/[lang]/vocab/[id]`), add an "Image" section:

**If image exists**:
```
[ Image thumbnail, ~200×200 ]

[Regenerate] [Advanced: customize prompt ▾] [Delete]
```

**If status = 'generating'**: spinner with "Generating..."

**If status = 'refused' or 'failed'**:
```
[ Placeholder icon, ~200×200 ]
The previous attempt was refused/failed.
[Regenerate] [Advanced: customize prompt ▾]
```

**If status = 'none'**:
```
[ Faint "No image yet" placeholder ]
[Generate image] [Advanced: customize prompt ▾]
```

### 7.2 Advanced prompt override

Click "Advanced: customize prompt" → expands to show a textarea pre-filled with the default prompt for this item. User can edit, save, regenerate.

The override is stored in `vocab_items.imagePromptOverride`. When generating:
- If override exists and non-empty, use it (wrapped with the no-text rule per `buildImagePrompt`)
- Else use the standard template

"Reset to default" button clears the override.

### 7.3 Regenerate flow

1. User clicks "Regenerate"
2. If the user is already at the monthly hard stop, show 402-error modal directing to settings
3. Otherwise, confirm dialog: "Regenerate this image? The current image will be deleted. Estimated cost: $0.02. Month-to-date: $X.XX of $Y."
4. On confirm: delete the existing image from storage, set status='generating', call the provider, store new image, update status to 'completed'
5. UI updates with new image

### 7.4 Delete image flow

"Delete" button next to regenerate. Confirm modal: "Delete this image? You can generate a new one later." On confirm: delete from storage, set `imageStorageKey = null` and `imageStatus = 'none'`.

This does NOT delete the vocab item itself — only the image.

### 7.5 API routes

- `POST /api/vocab/[id]/image/generate` — generate (single)
- `POST /api/vocab/[id]/image/regenerate` — regenerate (deletes old, makes new)
- `DELETE /api/vocab/[id]/image` — delete only the image
- `PATCH /api/vocab/[id]/image-prompt-override` — save the prompt override

All of these check hard-stop and update the spend log for cost-incurring operations.

### 7.6 Section commit

```
feat(vocab): per-item image generation, regenerate, prompt override, delete
```

---

## Section 8 — Thumbnails in vocab tables

### 8.1 New column

In both the main vocab list table and the lesson-scoped vocab table, add a leftmost column **"Image"** (before Target/Thai).

Cell content:
- If `imageStorageKey` exists: `<img>` tag, sized ~40×40, rounded corners, `cursor-pointer`
- If status = 'generating': small spinner
- If status = 'refused' or 'failed': a faint warning icon (`AlertTriangle` from lucide-react, muted) with tooltip "Generation failed/refused"
- If status = 'none': a faint placeholder icon (`ImageOff` from lucide-react, muted)

For sortability: the existing sort header pattern doesn't apply to the image column (skip).

### 8.2 Click-to-expand modal

Clicking a thumbnail opens a modal showing the image at full size (max 1024×1024 or viewport-fitted, whichever smaller). The modal also shows:
- The Thai text
- The English text
- "View vocab item" link → goes to the edit page
- "Close" button

Use `Dialog` from shadcn.

Stop click propagation so clicking the thumbnail doesn't trigger any row-level click handlers.

### 8.3 Performance: lazy loading

Add `loading="lazy"` to all `<img>` tags in the table. For 1,000+ rows, this matters.

If the user has filters that show a small number of items, eager-load the first ~20.

### 8.4 Mobile

On narrow viewports, the thumbnail column still appears but at smaller size (~32×32). Tap-to-expand works the same way.

### 8.5 Section commit

```
feat(vocab): image thumbnails in vocab tables with click-to-expand modal
```

---

## Section 9 — End-to-end verification

### 9.1 Manual checks

Settings:
- [ ] "LLM provider" renamed to "Chat Model"
- [ ] New "Image Model" section: provider + model dropdowns
- [ ] Default selections: Google + Imagen 4 Fast
- [ ] Changing provider auto-selects that provider's default model
- [ ] Auto-save works (no Save button needed)
- [ ] "Estimated cost: $0.02 per image" shows below the model selector
- [ ] Warning if no API key for the selected image provider
- [ ] "Image generation budget" section with reminder ($25 default) and hard stop ($100 default)
- [ ] Auto-save on blur for budget inputs
- [ ] Current state line: "Month to date: $X.XX spent of $100 hard stop · Next reminder at $25 · N images possible"

Single-item flow:
- [ ] Open a vocab item edit page; "Generate image" button visible
- [ ] Click → wait ~10 seconds → image appears
- [ ] Spend tracking updates
- [ ] Regenerate works (old image deleted from storage)
- [ ] Advanced prompt override saves; affects next generation
- [ ] Delete image works (image gone, vocab remains, status='none')

Bulk flow:
- [ ] "Generate Images" button on vocab page enters selection mode
- [ ] Checkboxes appear on rows
- [ ] Image status filter (All / Has / No image / Failed) works
- [ ] "Select all visible" selects the filtered set
- [ ] Cost preview modal shows accurate estimate
- [ ] Confirm → status updates to 'generating', polling reveals progress
- [ ] Completed items show thumbnails
- [ ] Failed items show error indicator
- [ ] "Stop" button stops further queued items

Cost enforcement:
- [ ] Set hard stop to $0.10, try to generate → blocked with clear message
- [ ] Set reminder to $0.05 and hard stop to $1, generate 3 items → reminder banner shows after crossing $0.05 / $0.10 / $0.15 thresholds (or however the bands land)
- [ ] Reset month boundary: change system date or update DB row directly, verify spend resets

Thumbnails:
- [ ] Vocab list shows thumbnails (~40×40) in the leftmost column
- [ ] Click thumbnail → modal opens with full-size image
- [ ] Lesson detail page's vocab section also shows thumbnails
- [ ] Images with status='generating' show spinner
- [ ] Images with status='refused' show warning icon

Storage:
- [ ] Generated image lands at `public/users/{userId}/vocab/{vocabId}/{randomId}.png`
- [ ] Local URL serves via /api/files/public/... without auth
- [ ] Regenerate creates a new randomId path; old path is deleted

### 9.2 Automated checks

```bash
pnpm lint        # 0 errors
pnpm test        # all unit tests pass
pnpm test:e2e    # E2E passes
pnpm build       # successful production build
```

Add a unit test:

`tests/unit/cost-tracking.test.ts`:
- Mock DB with seeded rows in `image_generation_log`
- Verify `getMonthToDateImageSpend` returns correct sum for current month
- Verify previous month's spend is excluded
- Verify failed entries are excluded; refused entries are included

Add a unit test:

`tests/unit/image-prompt.test.ts`:
- Default prompt contains the no-text rule
- Override prompt is appended with the no-text rule
- Special characters in native_text don't break the template

### 9.3 Update ERROR_REPORT.md

Add a section:

```markdown
## Vocab image generation

### Changes
- DB: vocab image state columns; image_generation_log table; user_settings image columns
- Image gen provider abstraction with Google Imagen 4 (default: Fast) and OpenAI GPT-Image
- Standard prompt template enforces no-text-in-image and cartoon style
- Public-URL storage path for vocab images (non-sensitive cacheable content)
- Cost tracking: monthly aggregation, reminder bands, hard-stop enforcement
- Settings: renamed "LLM provider" → "Chat Model"; new "Image Model" and "Image generation budget" sections
- Vocab list: "Generate Images" button enters selection mode; bulk cost-preview flow
- Vocab edit page: per-item generate / regenerate / prompt override / delete
- Vocab table: leftmost image column with thumbnails; click-to-expand modal

### Issues hit
(record any during implementation)

### Known follow-ups
- Bulk generation is in-process; no resilience to server restart. A real job queue
  (BullMQ + Redis) is the next step if bulk runs become long enough to span restarts.
- Cost tracking is image-gen only; chat token cost tracking is a future addition.
- Anthropic models can't generate images; only Chat Model setting offers Anthropic.
- No retry-with-backoff on transient provider failures yet.
- The image prompt is in English; users studying other languages with non-English
  native text (e.g., a Spanish speaker learning Thai) will need to be aware that
  the native_text field drives image gen and should be a language the image model
  understands well. Document in user-facing help text.
```

### 9.4 Push

```bash
git push origin main
```

---

## Defaults you may apply silently

- Specific Tailwind classes for thumbnail sizing, modal layouts, spinner colors
- Exact phrasing of toast and modal copy
- Whether to use a 2 or 3 concurrent generation in the bulk runner
- Poll interval for progress (5 seconds suggested; tweak as needed)
- Image quality/size parameters within the provider SDK calls — match the catalog tier semantics

## Things to check back on

- If the `@google/genai` SDK has shifted significantly (it's been moving fast) — adapt to the current docs
- If GCS bucket-uniform-access is enabled, `file.makePublic()` will fail — document the alternative IAM approach in README
- If Next.js Server Components / Server Actions don't support long-running background work in your hosting environment — the in-process executor will work in your case (long-lived Node process behind nginx) but the constraint matters

## Out of scope (do NOT build)

- Image generation for sentences (your use case explicitly excludes these)
- Audio-to-image generation
- Vocab notes rich text → image
- Chat token cost tracking
- A real job queue (BullMQ + Redis)
- Image-style preferences beyond "cartoon"
- Per-image moderation / content filtering beyond the provider's own
- Image editing / inpainting

---

## End of spec

Start with Section 1. Commit per section. Update ERROR_REPORT.md at the end. Push to origin/main.