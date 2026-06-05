'use client';

import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MODELS, PROVIDERS, type Provider } from '@/lib/models';
import { VOICE_MODELS, voiceModelCostPerMinute } from '@/lib/voice-models';
import {
  ROMANIZATION_MODELS,
  romanizationModelProvider,
  romanizationModelCostPer1kChars,
} from '@/lib/romanization-models';
import {
  LANGUAGES,
  UNLOCKED_TARGET_LANGUAGES,
  languageDisplayLabel,
  type LanguageCode,
} from '@/lib/languages';
import { LOCALE_CATALOG, LOCALE_LIST, normalizeLocale, type Locale } from '@/lib/locales';
import {
  IMAGE_MODELS,
  IMAGE_PROVIDERS,
  defaultImageModel,
  imageModelCost,
  type ImageProviderId,
} from '@/lib/image-gen';
import {
  EXTRACTION_MODELS,
  EXTRACTION_PROVIDERS,
  defaultExtractionModel,
  type ExtractionProvider,
} from '@/lib/extraction/catalog';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useFieldAutoSave, SaveStatus } from '@/components/save-status';
import { InfoIcon } from '@/components/ui/info-icon';
import { withBase } from '@/lib/base-path';
import { ProfileSection } from '@/components/settings/profile-section';
import { RoleManagementSection } from '@/components/settings/role-management-section';
import { AiChatSection } from '@/components/settings/ai-chat-section';

interface KeyInfo {
  masked: string;
  plaintext: string | null;
}

interface SettingsState {
  llmProvider: Provider;
  llmModel: string;
  targetLanguage: LanguageCode;
  nativeLanguage: Locale;
  imageProvider: ImageProviderId;
  imageModel: string;
  extractionProvider: ExtractionProvider;
  extractionModel: string;
  voiceModel: string;
  romanizationModel: string;
  aiSpendReminderUsd: number;
  aiSpendHardStopUsd: number;
  keys: Record<Provider, KeyInfo | null>;
  // Per-provider: the user has no personal key and falls back to a superuser
  // global key. The global value is never sent — this is just a boolean.
  usingGlobalKey?: Record<Provider, boolean>;
}

interface SpendSnapshot {
  currentSpend: number;
  hardStop: number;
  reminder: number;
  lastReminderBand: number;
  nextReminderBand: number;
  monthLabel: string;
  provider: string;
  model: string;
  estimatedCostPerImage: number;
}

const PROVIDER_LABELS: Record<Provider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
};

// §3b: per-provider, non-technical step-by-step help for obtaining an API key.
// `usedFor` is tailored to what each provider powers in THIS app.
const PROVIDER_KEY_HELP: Record<
  Provider,
  { link: string; usedFor: string; steps: string[] }
> = {
  openai: {
    link: 'https://platform.openai.com/api-keys',
    usedFor: 'Kruu Bingo voice chat and image generation',
    steps: [
      'Go to platform.openai.com and sign in (this is separate from ChatGPT).',
      'Add a payment method under Settings → Billing — a small prepaid balance (about $5) is required before a key works; complete phone verification if asked.',
      'Open the API keys page (platform.openai.com/api-keys).',
      'Click "Create new secret key", name it, and copy the key (starts with "sk-"). It is shown only once.',
      'Paste it into the OpenAI field here.',
    ],
  },
  anthropic: {
    link: 'https://console.anthropic.com/settings/keys',
    usedFor: 'the AI chat and photo analysis',
    steps: [
      'Go to console.anthropic.com and sign in (separate from the Claude.ai app).',
      'Add a payment method under Billing (required before a key works).',
      'Open Settings → API keys (console.anthropic.com/settings/keys).',
      'Click "Create Key", name it, and copy the key (starts with "sk-ant-"). Shown once.',
      'Paste it into the Anthropic field here.',
    ],
  },
  google: {
    link: 'https://aistudio.google.com/app/apikey',
    usedFor: 'image generation',
    steps: [
      'Go to aistudio.google.com/app/apikey and sign in with a Google account.',
      'Click "Create API key" and let it create or select a Google Cloud project.',
      'Copy the key (starts with "AIza"). A free tier is available; heavy use needs billing enabled in Google Cloud.',
      'Paste it into the Google field here.',
    ],
  },
};

/**
 * §2 security: only honor a `returnTo` that is a relative in-app path — starts
 * with a single `/`, is not protocol-relative (`//`), and carries no scheme or
 * host. Anything else is ignored (never redirect to an external URL).
 */
function safeReturnTo(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null; // has a scheme
  return value;
}

const IMAGE_PROVIDER_LABELS: Record<ImageProviderId, string> = {
  google: 'Google',
  openai: 'OpenAI',
};

const IMAGE_PROVIDER_KEY: Record<ImageProviderId, Provider> = {
  google: 'google',
  openai: 'openai',
};

const EXTRACTION_PROVIDER_LABELS: Record<ExtractionProvider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
};

const EXTRACTION_PROVIDER_KEY: Record<ExtractionProvider, Provider> = {
  anthropic: 'anthropic',
  openai: 'openai',
  google: 'google',
};

export default function SettingsPage() {
  const router = useRouter();
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const [state, setState] = useState<SettingsState | null>(null);
  const [spend, setSpend] = useState<SpendSnapshot | null>(null);
  const [busy, setBusy] = useState(false);

  const targetSave = useFieldAutoSave();
  const nativeSave = useFieldAutoSave();
  const voiceModelSave = useFieldAutoSave();
  const romanizationSave = useFieldAutoSave();
  const imageProviderSave = useFieldAutoSave();
  const imageModelSave = useFieldAutoSave();
  const extractionProviderSave = useFieldAutoSave();
  const extractionModelSave = useFieldAutoSave();
  const reminderSave = useFieldAutoSave();
  const hardStopSave = useFieldAutoSave();

  const [reminderDraft, setReminderDraft] = useState('');
  const [hardStopDraft, setHardStopDraft] = useState('');

  const [keyDrafts, setKeyDrafts] = useState<Record<Provider, string>>({
    anthropic: '',
    openai: '',
    google: '',
  });
  const [reveal, setReveal] = useState<Record<Provider, boolean>>({
    anthropic: false,
    openai: false,
    google: false,
  });

  // §2: after a redirect-to-settings-for-a-key, send the user back where they
  // came from once the required key is saved. Read from the URL on mount (avoids
  // useSearchParams' Suspense requirement).
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [needKey, setNeedKey] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setReturnTo(safeReturnTo(params.get('returnTo')));
    setNeedKey(params.get('needKey'));
  }, []);

  async function load() {
    const res = await fetch(withBase('/api/settings'));
    if (!res.ok) {
      toast.error('Failed to load settings');
      return;
    }
    const data = (await res.json()) as SettingsState;
    setState(data);
    setReminderDraft(String(data.aiSpendReminderUsd ?? 25));
    setHardStopDraft(String(data.aiSpendHardStopUsd ?? 100));
    // Seed each key field with the owner's stored (decrypted) key so it shows
    // in the box, masked, with an eye toggle.
    setKeyDrafts({
      anthropic: data.keys.anthropic?.plaintext ?? '',
      openai: data.keys.openai?.plaintext ?? '',
      google: data.keys.google?.plaintext ?? '',
    });
  }

  async function loadSpend() {
    const res = await fetch(withBase('/api/settings/ai-spend'));
    if (!res.ok) return;
    setSpend((await res.json()) as SpendSnapshot);
  }

  useEffect(() => {
    load();
    loadSpend();
  }, []);

  async function patchOrThrow(body: Record<string, unknown>) {
    const res = await fetch(withBase('/api/settings'), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error ?? 'Save failed');
    }
  }

  async function patchForKey(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(withBase('/api/settings'), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.error ?? 'Save failed');
        return false;
      }
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function saveKey(provider: Provider) {
    const value = keyDrafts[provider].trim();
    if (!value) {
      toast.error('Enter a key first');
      return;
    }
    const ok = await patchForKey({ apiKey: { provider, value } });
    if (ok) {
      toast.success(`${PROVIDER_LABELS[provider]} key saved`);
      await load();
      // §2: return to origin once the required key is saved. If `needKey` was
      // given, only redirect when THAT provider's key was the one saved (so
      // saving an unrelated key doesn't yank the user away). With no `needKey`,
      // any successful save returns the user while a `returnTo` is present.
      if (returnTo && (!needKey || needKey === provider)) {
        toast.success('Returning to where you left off…');
        router.push(returnTo);
      }
    }
  }

  async function removeKey(provider: Provider) {
    const ok = await patchForKey({ apiKey: { provider, value: null } });
    if (ok) {
      toast.success(`${PROVIDER_LABELS[provider]} key removed`);
      await load();
    }
  }

  function toggleReveal(provider: Provider) {
    // The decrypted key is already loaded; the eye just flips input masking.
    setReveal((r) => ({ ...r, [provider]: !r[provider] }));
  }

  function onTargetLanguageChange(code: LanguageCode) {
    if (!state || code === state.targetLanguage) return;
    setState({ ...state, targetLanguage: code });
    void targetSave.run(async () => {
      await patchOrThrow({ targetLanguage: code });
      router.refresh();
    });
  }

  function onNativeLanguageChange(code: Locale) {
    if (!state || code === state.nativeLanguage) return;
    setState({ ...state, nativeLanguage: code });
    void nativeSave.run(async () => {
      await patchOrThrow({ nativeLanguage: code });
      router.refresh();
    });
  }

  function onVoiceModelChange(modelId: string) {
    if (!state || modelId === state.voiceModel) return;
    setState({ ...state, voiceModel: modelId });
    void voiceModelSave.run(async () => {
      await patchOrThrow({ voiceModel: modelId });
    });
  }

  function onRomanizationModelChange(modelId: string) {
    if (!state || modelId === state.romanizationModel) return;
    setState({ ...state, romanizationModel: modelId });
    void romanizationSave.run(async () => {
      await patchOrThrow({ romanizationModel: modelId });
    });
  }

  function onImageProviderChange(p: ImageProviderId) {
    if (!state || p === state.imageProvider) return;
    const newModel = defaultImageModel(p);
    setState({ ...state, imageProvider: p, imageModel: newModel });
    void imageProviderSave.run(async () => {
      await patchOrThrow({ imageProvider: p, imageModel: newModel });
      await loadSpend();
    });
  }

  function onImageModelChange(modelId: string) {
    if (!state || modelId === state.imageModel) return;
    setState({ ...state, imageModel: modelId });
    void imageModelSave.run(async () => {
      await patchOrThrow({ imageModel: modelId });
      await loadSpend();
    });
  }

  function onExtractionProviderChange(p: ExtractionProvider) {
    if (!state || p === state.extractionProvider) return;
    const newModel = defaultExtractionModel(p);
    setState({ ...state, extractionProvider: p, extractionModel: newModel });
    void extractionProviderSave.run(async () => {
      await patchOrThrow({ extractionProvider: p, extractionModel: newModel });
    });
  }

  function onExtractionModelChange(modelId: string) {
    if (!state || modelId === state.extractionModel) return;
    setState({ ...state, extractionModel: modelId });
    void extractionModelSave.run(async () => {
      await patchOrThrow({ extractionModel: modelId });
    });
  }

  function saveReminder() {
    if (!state) return;
    const next = Number(reminderDraft);
    if (!Number.isFinite(next) || next < 1) {
      reminderSave.run(async () => {
        throw new Error('Must be at least $1');
      });
      return;
    }
    if (next === state.aiSpendReminderUsd) return;
    setState({ ...state, aiSpendReminderUsd: next });
    void reminderSave.run(async () => {
      await patchOrThrow({ aiSpendReminderUsd: next });
      await loadSpend();
    });
  }

  function saveHardStop() {
    if (!state) return;
    const next = Number(hardStopDraft);
    if (!Number.isFinite(next) || next < state.aiSpendReminderUsd) {
      hardStopSave.run(async () => {
        throw new Error('Must be ≥ reminder');
      });
      return;
    }
    if (next === state.aiSpendHardStopUsd) return;
    setState({ ...state, aiSpendHardStopUsd: next });
    void hardStopSave.run(async () => {
      await patchOrThrow({ aiSpendHardStopUsd: next });
      await loadSpend();
    });
  }

  if (!state) return <p className="text-sm text-muted-foreground">Loading settings…</p>;

  // "Has a usable key" = a personal key OR a covering global key (the server
  // resolves personal → global), so a global-key user doesn't see the warning.
  const imageProviderKey = IMAGE_PROVIDER_KEY[state.imageProvider];
  const imageProviderHasKey =
    !!state.keys[imageProviderKey] || !!state.usingGlobalKey?.[imageProviderKey];
  const imageCostPerImage = imageModelCost(state.imageProvider, state.imageModel);
  const voiceCostPerMin = voiceModelCostPerMinute(state.voiceModel);
  const romanizationCostPer1k = romanizationModelCostPer1kChars(state.romanizationModel);
  const romanizationProvider = romanizationModelProvider(state.romanizationModel);
  const imagesPossible =
    spend && spend.estimatedCostPerImage > 0
      ? Math.max(0, Math.floor((spend.hardStop - spend.currentSpend) / spend.estimatedCostPerImage))
      : 0;

  // Responsive table row: a labeled stacked card on mobile, an aligned grid row
  // on desktop (Function | Provider | Model | Est. Cost).
  const rowCls =
    'grid grid-cols-1 gap-3 rounded-lg border p-3 md:grid-cols-[150px_1fr_1fr_120px] md:items-start md:gap-3 md:rounded-none md:border-0 md:border-b md:p-0 md:pb-4';

  return (
    <div className="space-y-6 max-w-2xl">
      <ProfileSection />
      <Card>
        <CardHeader>
          <CardTitle>{t('languages')}</CardTitle>
          <CardDescription>{t('languagesDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>{t('baseLanguage')}</Label>
                <SaveStatus status={nativeSave.status} />
              </div>
              <Select
                value={state.nativeLanguage}
                onValueChange={(v) => v && onNativeLanguageChange(v as Locale)}
              >
                <SelectTrigger>
                  <SelectValue>
                    {(value: string) => LOCALE_CATALOG[normalizeLocale(value)].nativeName}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {LOCALE_LIST.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.nativeName} ({l.englishName})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>{t('targetLanguage')}</Label>
                <SaveStatus status={targetSave.status} />
              </div>
              <Select
                value={state.targetLanguage}
                onValueChange={(v) => v && onTargetLanguageChange(v as LanguageCode)}
              >
                <SelectTrigger>
                  <SelectValue>
                    {(value: string) => languageDisplayLabel(value)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => {
                    const unlocked = UNLOCKED_TARGET_LANGUAGES.includes(l.code);
                    return (
                      <SelectItem key={l.code} value={l.code} disabled={!unlocked}>
                        {languageDisplayLabel(l.code)}
                        {!unlocked && ' (coming soon)'}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('aiModels')}</CardTitle>
          <CardDescription>Choose the models that power each AI feature.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Column headers (desktop only) */}
          <div className="hidden gap-3 px-1 text-xs font-medium text-muted-foreground md:grid md:grid-cols-[150px_1fr_1fr_120px]">
            <span>Function</span>
            <span>Provider</span>
            <span>Model</span>
            <span>Est. Cost</span>
          </div>

          {/* Text chat — greyed "Coming soon" (renamed former Chat row). */}
          <div className={`${rowCls} opacity-70 md:opacity-100`}>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium">{t('models.textChat')}</span>
              <InfoIcon label="About text chat">
                Will let the text AI tutor use the model of your choice. Not yet active.
              </InfoIcon>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {tc('comingSoon')}
              </span>
            </div>
            <div className="space-y-1 md:opacity-60">
              <span className="text-xs text-muted-foreground md:hidden">Provider</span>
              <Select value={state.llmProvider} disabled>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PROVIDER_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 md:opacity-60">
              <span className="text-xs text-muted-foreground md:hidden">Model</span>
              <Select value={state.llmModel} disabled>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODELS[state.llmProvider].map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground md:hidden">Est. Cost</span>
              <p className="text-sm text-muted-foreground">—</p>
            </div>
          </div>

          {/* Voice chat — OpenAI realtime (provider is fixed). */}
          <div className={rowCls}>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium">{t('models.voiceChat')}</span>
              <InfoIcon label="About voice chat">
                The OpenAI realtime model that powers Kruu Bingo voice practice. Requires
                an OpenAI API key.
              </InfoIcon>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground md:hidden">Provider</span>
              <p className="py-1.5 text-sm">OpenAI</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground md:hidden">Model</span>
                <SaveStatus status={voiceModelSave.status} />
              </div>
              <Select value={state.voiceModel} onValueChange={(v) => v && onVoiceModelChange(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VOICE_MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground md:hidden">Est. Cost</span>
              <p className="text-sm">~${voiceCostPerMin.toFixed(2)} / min</p>
            </div>
          </div>

          {/* Captions (romanization) — text model that transliterates captions. */}
          <div className={rowCls}>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium">{t('models.captions')}</span>
              <InfoIcon label="About caption romanization">
                Powers romanized captions — transliterates the tutor&apos;s and your
                lines into tone-marked Latin script. Only used when caption language is
                set to romanized.
              </InfoIcon>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground md:hidden">Provider</span>
              <p className="py-1.5 text-sm">{PROVIDER_LABELS[romanizationProvider]}</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground md:hidden">Model</span>
                <SaveStatus status={romanizationSave.status} />
              </div>
              <Select
                value={state.romanizationModel}
                onValueChange={(v) => v && onRomanizationModelChange(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROMANIZATION_MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground md:hidden">Est. Cost</span>
              <p className="text-sm">~${romanizationCostPer1k.toFixed(3)} / 1K chars</p>
            </div>
          </div>

          {/* Image generation — existing image-gen model. */}
          <div className={rowCls}>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium">{t('models.imageGen')}</span>
              <InfoIcon label="About image generation">
                Generates illustrations for your vocabulary.
              </InfoIcon>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground md:hidden">Provider</span>
                <SaveStatus status={imageProviderSave.status} />
              </div>
              <Select
                value={state.imageProvider}
                onValueChange={(v) => v && onImageProviderChange(v as ImageProviderId)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMAGE_PROVIDERS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {IMAGE_PROVIDER_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground md:hidden">Model</span>
                <SaveStatus status={imageModelSave.status} />
              </div>
              <Select value={state.imageModel} onValueChange={(v) => v && onImageModelChange(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMAGE_MODELS[state.imageProvider].map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!imageProviderHasKey && (
                <p className="text-xs text-amber-700">
                  No API key for {IMAGE_PROVIDER_LABELS[state.imageProvider]}. Add one
                  below.
                </p>
              )}
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground md:hidden">Est. Cost</span>
              <p className="text-sm">${imageCostPerImage.toFixed(3)} per image</p>
            </div>
          </div>

          {/* Photo analysis — renamed photo→vocab extraction (same setting). */}
          <div className={`${rowCls} md:border-b-0 md:pb-0`}>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium">{t('models.photoAnalysis')}</span>
              <InfoIcon label="About photo analysis">
                Vision-capable model that extracts vocabulary from photos you upload.
              </InfoIcon>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground md:hidden">Provider</span>
                <SaveStatus status={extractionProviderSave.status} />
              </div>
              <Select
                value={state.extractionProvider}
                onValueChange={(v) => v && onExtractionProviderChange(v as ExtractionProvider)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXTRACTION_PROVIDERS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {EXTRACTION_PROVIDER_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground md:hidden">Model</span>
                <SaveStatus status={extractionModelSave.status} />
              </div>
              <Select
                value={state.extractionModel}
                onValueChange={(v) => v && onExtractionModelChange(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXTRACTION_MODELS[state.extractionProvider].map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!state.keys[EXTRACTION_PROVIDER_KEY[state.extractionProvider]] &&
                !state.usingGlobalKey?.[EXTRACTION_PROVIDER_KEY[state.extractionProvider]] && (
                <p className="text-xs text-amber-700">
                  No API key for {EXTRACTION_PROVIDER_LABELS[state.extractionProvider]}. Add
                  one below.
                </p>
              )}
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground md:hidden">Est. Cost</span>
              <p className="text-sm text-muted-foreground">—</p>
            </div>
          </div>

          {/* AI spend limits — sub-section beneath the table. */}
          <div id="ai-spend" className="space-y-4 border-t pt-6">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-medium">AI spend limits</h3>
              <InfoIcon label="About AI spend limits">
                Monthly cap applies to all AI features including image generation and Kruu
                Bingo practice sessions. Estimated based on provider pricing. Resets on the
                1st of each calendar month.
              </InfoIcon>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="reminder">Reminder every</Label>
                    <InfoIcon label="About spend reminders">
                      Show a banner each time your month-to-date spend crosses this amount.
                    </InfoIcon>
                  </div>
                  <SaveStatus status={reminderSave.status} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">$</span>
                  <Input
                    id="reminder"
                    type="number"
                    min="1"
                    step="1"
                    value={reminderDraft}
                    onChange={(e) => setReminderDraft(e.target.value)}
                    onBlur={saveReminder}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="hardstop">Hard stop at</Label>
                    <InfoIcon label="About the hard stop">
                      Block further image generation when month-to-date spend reaches this
                      amount.
                    </InfoIcon>
                  </div>
                  <SaveStatus status={hardStopSave.status} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">$</span>
                  <Input
                    id="hardstop"
                    type="number"
                    min="1"
                    step="1"
                    value={hardStopDraft}
                    onChange={(e) => setHardStopDraft(e.target.value)}
                    onBlur={saveHardStop}
                  />
                </div>
              </div>
            </div>
            {spend && (
              <p className="border-t pt-3 text-xs text-muted-foreground">
                {spend.monthLabel} to date: ${spend.currentSpend.toFixed(2)} spent of $
                {spend.hardStop.toFixed(2)} hard stop
                {spend.reminder > 0 && (
                  <>
                    {' · '}Next reminder at ${spend.nextReminderBand.toFixed(2)}
                  </>
                )}
                {spend.estimatedCostPerImage > 0 && (
                  <>
                    {' · '}
                    {imagesPossible.toLocaleString()} images possible at current model price
                  </>
                )}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card id="api-keys">
        <CardHeader>
          <div className="flex items-center gap-1.5">
            <CardTitle>{t('apiKeys')}</CardTitle>
            {/* §3a: plain-language "what is an API key" help. */}
            <InfoIcon label="What is an API key">
              An API key is like a password that lets this app use an AI provider on
              your behalf. You create it (free) on the provider&apos;s website, paste it
              here, and we store it encrypted. The provider bills you directly for usage —
              we never see or charge your card. You can replace or remove a key anytime.
            </InfoIcon>
          </div>
          <CardDescription>
            Stored encrypted at rest (AES-256-GCM). Use the eye icon to reveal a key.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {PROVIDERS.map((provider) => {
            const info = state.keys[provider];
            const revealed = reveal[provider];
            return (
              <div key={provider} className="space-y-2 border-b pb-4 last:border-b-0 last:pb-0">
                <div className="flex items-center gap-1.5">
                  <Label>{PROVIDER_LABELS[provider]} API key</Label>
                  {/* §3b: per-provider step-by-step instructions + a clickable link. */}
                  <InfoIcon label={`How to get a ${PROVIDER_LABELS[provider]} API key`}>
                    <p className="font-medium">{PROVIDER_LABELS[provider]} API key</p>
                    <p className="text-muted-foreground">
                      Used for {PROVIDER_KEY_HELP[provider].usedFor} in this app.
                    </p>
                    <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs">
                      {PROVIDER_KEY_HELP[provider].steps.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                    <a
                      href={PROVIDER_KEY_HELP[provider].link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block text-xs font-medium underline hover:text-foreground"
                    >
                      Open the {PROVIDER_LABELS[provider]} key page →
                    </a>
                  </InfoIcon>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={revealed ? 'text' : 'password'}
                      placeholder={
                        !info && state.usingGlobalKey?.[provider]
                          ? t('usingGlobalKey')
                          : 'Paste API key'
                      }
                      value={keyDrafts[provider]}
                      onChange={(e) =>
                        setKeyDrafts({ ...keyDrafts, [provider]: e.target.value })
                      }
                      autoComplete="off"
                      className="pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => toggleReveal(provider)}
                      aria-label={revealed ? 'Hide API key' : 'Reveal API key'}
                      aria-pressed={revealed}
                      className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-r-md"
                    >
                      {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <Button onClick={() => saveKey(provider)} disabled={busy}>
                    Save
                  </Button>
                </div>
                {info ? (
                  <button
                    type="button"
                    onClick={() => removeKey(provider)}
                    className="text-xs text-destructive underline hover:opacity-80"
                  >
                    Remove
                  </button>
                ) : (
                  <span className="text-xs text-muted-foreground">Not configured</span>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
      <AiChatSection />
      <RoleManagementSection />
    </div>
  );
}
