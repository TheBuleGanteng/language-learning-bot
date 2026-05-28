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
    // If model isn't being explicitly set, snap to the provider's default
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

  if (parsed.data.apiKey) {
    const { provider, value } = parsed.data.apiKey;
    const col = PROVIDER_KEY_COL[provider];
    updates[col] = value ? encryptString(value) : null;
  }

  // The user_settings table doesn't store language fields — they live on
  // `users`. Update those in a separate query when present.
  const userUpdates: Record<string, unknown> = {};
  if (parsed.data.targetLanguage) userUpdates.targetLanguage = parsed.data.targetLanguage;
  if (parsed.data.nativeLanguage) userUpdates.nativeLanguage = parsed.data.nativeLanguage;
  if (Object.keys(userUpdates).length > 0) {
    userUpdates.updatedAt = new Date();
    await db.update(users).set(userUpdates).where(eq(users.id, userId));
  }

  // Only run the settings update if there's an actual settings field to write
  // (avoid no-op writes that just bump updatedAt).
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
