import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { userSettings, users } from '@/db/schema';
import { auth } from '@/lib/auth';
import {
  PROVIDERS,
  isProvider,
  isValidModelForProvider,
  defaultModelFor,
  type Provider,
} from '@/lib/models';
import { encryptString, decryptString, maskKey } from '@/lib/crypto';
import { LANGUAGES, normalizeLanguageCode } from '@/lib/languages';
import {
  IMAGE_PROVIDERS,
  defaultImageModel,
  isImageProvider,
  isValidImageModel,
  type ImageProviderId,
} from '@/lib/image-gen';
import {
  EXTRACTION_PROVIDERS,
  defaultExtractionModel,
  isExtractionProvider,
  isValidExtractionModel,
  type ExtractionProvider,
} from '@/lib/extraction/catalog';

const LANGUAGE_CODES = LANGUAGES.map((l) => l.code) as [string, ...string[]];

const PROVIDER_KEY_COL = {
  anthropic: 'anthropicApiKeyEncrypted',
  openai: 'openaiApiKeyEncrypted',
  google: 'geminiApiKeyEncrypted',
} as const satisfies Record<Provider, keyof typeof userSettings.$inferSelect>;

async function getOrCreateSettings(userId: string) {
  const [existing] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  if (existing) return existing;
  await db.insert(userSettings).values({ userId }).onConflictDoNothing();
  const [row] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  return row!;
}

function formatKey(encrypted: string | null, includePlaintext: boolean) {
  if (!encrypted) return null;
  try {
    const plain = decryptString(encrypted);
    return { masked: maskKey(plain), plaintext: includePlaintext ? plain : null };
  } catch {
    return { masked: '••••', plaintext: null };
  }
}

export async function GET(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const revealParam = url.searchParams.get('reveal');
  const reveal = revealParam && isProvider(revealParam) ? revealParam : null;

  const s = await getOrCreateSettings(userId);
  const [u] = await db
    .select({
      targetLanguage: users.targetLanguage,
      nativeLanguage: users.nativeLanguage,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return NextResponse.json({
    llmProvider: s.llmProvider,
    llmModel: s.llmModel,
    targetLanguage: normalizeLanguageCode(u?.targetLanguage),
    nativeLanguage: normalizeLanguageCode(u?.nativeLanguage),
    imageProvider: s.imageProvider,
    imageModel: s.imageModel,
    extractionProvider: s.extractionProvider,
    extractionModel: s.extractionModel,
    aiSpendReminderUsd: Number(s.aiSpendReminderUsd ?? 25),
    aiSpendHardStopUsd: Number(s.aiSpendHardStopUsd ?? 100),
    keys: {
      anthropic: formatKey(s.anthropicApiKeyEncrypted, reveal === 'anthropic'),
      openai: formatKey(s.openaiApiKeyEncrypted, reveal === 'openai'),
      google: formatKey(s.geminiApiKeyEncrypted, reveal === 'google'),
    },
  });
}

const patchSchema = z.object({
  llmProvider: z.enum(PROVIDERS).optional(),
  llmModel: z.string().min(1).max(100).optional(),
  imageProvider: z.enum(IMAGE_PROVIDERS as readonly [ImageProviderId, ...ImageProviderId[]]).optional(),
  imageModel: z.string().min(1).max(100).optional(),
  extractionProvider: z
    .enum(EXTRACTION_PROVIDERS as readonly [ExtractionProvider, ...ExtractionProvider[]])
    .optional(),
  extractionModel: z.string().min(1).max(100).optional(),
  aiSpendReminderUsd: z.number().min(1).max(99999).optional(),
  aiSpendHardStopUsd: z.number().min(1).max(99999).optional(),
  targetLanguage: z.enum(LANGUAGE_CODES).optional(),
  nativeLanguage: z.enum(LANGUAGE_CODES).optional(),
  apiKey: z
    .object({
      provider: z.enum(PROVIDERS),
      value: z.string().nullable(),
    })
    .optional(),
});

export async function PATCH(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  await getOrCreateSettings(userId);

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (parsed.data.llmProvider) {
    const p = parsed.data.llmProvider;
    updates.llmProvider = p;
    if (!parsed.data.llmModel) {
      updates.llmModel = defaultModelFor(p);
    }
  }

  if (parsed.data.llmModel) {
    const provider = parsed.data.llmProvider ?? (await getCurrentProvider(userId));
    if (!isValidModelForProvider(provider, parsed.data.llmModel)) {
      return NextResponse.json(
        { error: `Model ${parsed.data.llmModel} is not valid for provider ${provider}` },
        { status: 400 },
      );
    }
    updates.llmModel = parsed.data.llmModel;
  }

  if (parsed.data.imageProvider) {
    const p = parsed.data.imageProvider;
    updates.imageProvider = p;
    if (!parsed.data.imageModel) {
      updates.imageModel = defaultImageModel(p);
    }
  }

  if (parsed.data.imageModel) {
    const ip = parsed.data.imageProvider ?? (await getCurrentImageProvider(userId));
    if (!isValidImageModel(ip, parsed.data.imageModel)) {
      return NextResponse.json(
        { error: `Image model ${parsed.data.imageModel} is not valid for provider ${ip}` },
        { status: 400 },
      );
    }
    updates.imageModel = parsed.data.imageModel;
  }

  if (parsed.data.extractionProvider) {
    const p = parsed.data.extractionProvider;
    updates.extractionProvider = p;
    if (!parsed.data.extractionModel) {
      updates.extractionModel = defaultExtractionModel(p);
    }
  }

  if (parsed.data.extractionModel) {
    const ep =
      parsed.data.extractionProvider ?? (await getCurrentExtractionProvider(userId));
    if (!isValidExtractionModel(ep, parsed.data.extractionModel)) {
      return NextResponse.json(
        {
          error: `Extraction model ${parsed.data.extractionModel} is not valid for provider ${ep}`,
        },
        { status: 400 },
      );
    }
    updates.extractionModel = parsed.data.extractionModel;
  }

  if (parsed.data.aiSpendReminderUsd !== undefined) {
    updates.aiSpendReminderUsd = parsed.data.aiSpendReminderUsd.toFixed(2);
  }
  if (parsed.data.aiSpendHardStopUsd !== undefined) {
    updates.aiSpendHardStopUsd = parsed.data.aiSpendHardStopUsd.toFixed(2);
  }

  // Cross-field check: hard stop must be >= reminder. Use the post-patch
  // values, falling back to stored values for fields not in this PATCH.
  if (
    parsed.data.aiSpendReminderUsd !== undefined ||
    parsed.data.aiSpendHardStopUsd !== undefined
  ) {
    const [stored] = await db
      .select({
        reminder: userSettings.aiSpendReminderUsd,
        hardStop: userSettings.aiSpendHardStopUsd,
      })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);
    const newReminder =
      parsed.data.aiSpendReminderUsd ?? Number(stored?.reminder ?? 25);
    const newHardStop =
      parsed.data.aiSpendHardStopUsd ?? Number(stored?.hardStop ?? 100);
    if (newHardStop < newReminder) {
      return NextResponse.json(
        { error: 'Hard stop must be ≥ reminder' },
        { status: 400 },
      );
    }
  }

  if (parsed.data.apiKey) {
    const { provider, value } = parsed.data.apiKey;
    const col = PROVIDER_KEY_COL[provider];
    updates[col] = value ? encryptString(value) : null;
  }

  const userUpdates: Record<string, unknown> = {};
  if (parsed.data.targetLanguage) userUpdates.targetLanguage = parsed.data.targetLanguage;
  if (parsed.data.nativeLanguage) userUpdates.nativeLanguage = parsed.data.nativeLanguage;
  if (Object.keys(userUpdates).length > 0) {
    userUpdates.updatedAt = new Date();
    await db.update(users).set(userUpdates).where(eq(users.id, userId));
  }

  if (Object.keys(updates).length > 1) {
    await db.update(userSettings).set(updates).where(eq(userSettings.userId, userId));
  }

  return NextResponse.json({ ok: true });
}

async function getCurrentProvider(userId: string): Promise<Provider> {
  const [row] = await db
    .select({ p: userSettings.llmProvider })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  if (row && isProvider(row.p)) return row.p;
  return 'anthropic';
}

async function getCurrentImageProvider(userId: string): Promise<ImageProviderId> {
  const [row] = await db
    .select({ p: userSettings.imageProvider })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  if (row && isImageProvider(row.p)) return row.p;
  return 'google';
}

async function getCurrentExtractionProvider(userId: string): Promise<ExtractionProvider> {
  const [row] = await db
    .select({ p: userSettings.extractionProvider })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  if (row && isExtractionProvider(row.p)) return row.p;
  return 'anthropic';
}
