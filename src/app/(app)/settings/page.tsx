'use client';

import { useEffect, useState } from 'react';
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
import { MODELS, PROVIDERS, defaultModelFor, type Provider } from '@/lib/models';
import {
  LANGUAGES,
  UNLOCKED_TARGET_LANGUAGES,
  languageDisplayLabel,
  type LanguageCode,
} from '@/lib/languages';
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
import { useFieldAutoSave, SaveStatus } from '@/components/save-status';
import { withBase } from '@/lib/base-path';
import { ProfileSection } from '@/components/settings/profile-section';
import { RoleManagementSection } from '@/components/settings/role-management-section';
import { AvatarSettingsSection } from '@/components/settings/avatar-settings-section';

interface KeyInfo {
  masked: string;
  plaintext: string | null;
}

interface SettingsState {
  llmProvider: Provider;
  llmModel: string;
  targetLanguage: LanguageCode;
  nativeLanguage: LanguageCode;
  imageProvider: ImageProviderId;
  imageModel: string;
  extractionProvider: ExtractionProvider;
  extractionModel: string;
  aiSpendReminderUsd: number;
  aiSpendHardStopUsd: number;
  keys: Record<Provider, KeyInfo | null>;
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
  const [state, setState] = useState<SettingsState | null>(null);
  const [spend, setSpend] = useState<SpendSnapshot | null>(null);
  const [busy, setBusy] = useState(false);

  const targetSave = useFieldAutoSave();
  const nativeSave = useFieldAutoSave();
  const providerSave = useFieldAutoSave();
  const modelSave = useFieldAutoSave();
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

  async function load(revealProvider?: Provider) {
    const url = revealProvider ? withBase(`/api/settings?reveal=${revealProvider}`) : withBase('/api/settings');
    const res = await fetch(url);
    if (!res.ok) {
      toast.error('Failed to load settings');
      return;
    }
    const data = (await res.json()) as SettingsState;
    setState(data);
    setReminderDraft(String(data.aiSpendReminderUsd ?? 25));
    setHardStopDraft(String(data.aiSpendHardStopUsd ?? 100));
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
      setKeyDrafts({ ...keyDrafts, [provider]: '' });
      await load();
    }
  }

  async function removeKey(provider: Provider) {
    const ok = await patchForKey({ apiKey: { provider, value: null } });
    if (ok) {
      toast.success(`${PROVIDER_LABELS[provider]} key removed`);
      await load();
    }
  }

  async function toggleReveal(provider: Provider) {
    if (reveal[provider]) {
      setReveal({ ...reveal, [provider]: false });
      return;
    }
    const res = await fetch(withBase(`/api/settings?reveal=${provider}`));
    if (!res.ok) {
      toast.error('Failed to fetch key');
      return;
    }
    setState((await res.json()) as SettingsState);
    setReveal({ ...reveal, [provider]: true });
  }

  function onTargetLanguageChange(code: LanguageCode) {
    if (!state || code === state.targetLanguage) return;
    setState({ ...state, targetLanguage: code });
    void targetSave.run(async () => {
      await patchOrThrow({ targetLanguage: code });
      router.refresh();
    });
  }

  function onNativeLanguageChange(code: LanguageCode) {
    if (!state || code === state.nativeLanguage) return;
    setState({ ...state, nativeLanguage: code });
    void nativeSave.run(async () => {
      await patchOrThrow({ nativeLanguage: code });
      router.refresh();
    });
  }

  function onProviderChange(p: Provider) {
    if (!state || p === state.llmProvider) return;
    const newModel = defaultModelFor(p);
    setState({ ...state, llmProvider: p, llmModel: newModel });
    void providerSave.run(async () => {
      await patchOrThrow({ llmProvider: p, llmModel: newModel });
    });
  }

  function onModelChange(modelId: string) {
    if (!state || modelId === state.llmModel) return;
    setState({ ...state, llmModel: modelId });
    void modelSave.run(async () => {
      await patchOrThrow({ llmModel: modelId });
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

  const imageProviderHasKey = !!state.keys[IMAGE_PROVIDER_KEY[state.imageProvider]];
  const imageCostPerImage = imageModelCost(state.imageProvider, state.imageModel);
  const imagesPossible =
    spend && spend.estimatedCostPerImage > 0
      ? Math.max(0, Math.floor((spend.hardStop - spend.currentSpend) / spend.estimatedCostPerImage))
      : 0;

  return (
    <div className="space-y-6 max-w-2xl">
      <ProfileSection />
      <Card>
        <CardHeader>
          <CardTitle>Languages</CardTitle>
          <CardDescription>
            Pick which language you&apos;re studying (target) and your home language (native).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Target language</Label>
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
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Native language</Label>
                <SaveStatus status={nativeSave.status} />
              </div>
              <Select
                value={state.nativeLanguage}
                onValueChange={(v) => v && onNativeLanguageChange(v as LanguageCode)}
              >
                <SelectTrigger>
                  <SelectValue>
                    {(value: string) => languageDisplayLabel(value)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {languageDisplayLabel(l.code)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Chat Model</CardTitle>
          <CardDescription>
            Choose which model the AI tutor uses for chat. Each user can pick independently.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Provider</Label>
                <SaveStatus status={providerSave.status} />
              </div>
              <Select
                value={state.llmProvider}
                onValueChange={(v) => v && onProviderChange(v as Provider)}
              >
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
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Model</Label>
                <SaveStatus status={modelSave.status} />
              </div>
              <Select value={state.llmModel} onValueChange={(v) => v && onModelChange(v)}>
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
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Image Model</CardTitle>
          <CardDescription>
            Choose which model generates illustrations for your vocabulary.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Provider</Label>
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
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Model</Label>
                <SaveStatus status={imageModelSave.status} />
              </div>
              <Select
                value={state.imageModel}
                onValueChange={(v) => v && onImageModelChange(v)}
              >
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
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Estimated cost: ${imageCostPerImage.toFixed(3)} per image
          </p>
          {!imageProviderHasKey && (
            <p className="text-xs text-amber-700">
              You haven&apos;t entered an API key for{' '}
              {IMAGE_PROVIDER_LABELS[state.imageProvider]}. Add one below to use this
              model.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Photo Extraction Model</CardTitle>
          <CardDescription>
            Choose which vision-capable model extracts vocabulary from photos you
            upload.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Provider</Label>
                <SaveStatus status={extractionProviderSave.status} />
              </div>
              <Select
                value={state.extractionProvider}
                onValueChange={(v) =>
                  v && onExtractionProviderChange(v as ExtractionProvider)
                }
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
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Model</Label>
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
            </div>
          </div>
          {!state.keys[EXTRACTION_PROVIDER_KEY[state.extractionProvider]] && (
            <p className="text-xs text-amber-700">
              You haven&apos;t entered an API key for{' '}
              {EXTRACTION_PROVIDER_LABELS[state.extractionProvider]}. Add one below
              to use this model.
            </p>
          )}
        </CardContent>
      </Card>

      <Card id="ai-spend">
        <CardHeader>
          <CardTitle>AI spend limits</CardTitle>
          <CardDescription>
            Monthly cap applies to all AI features including image generation and Kruu
            Bingo practice sessions. Estimated based on provider pricing. Resets on the
            1st of each calendar month.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="reminder">Reminder every</Label>
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
              <p className="text-xs text-muted-foreground">
                Show a banner each time your month-to-date spend crosses this amount.
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="hardstop">Hard stop at</Label>
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
              <p className="text-xs text-muted-foreground">
                Block further image generation when month-to-date spend reaches this amount.
              </p>
            </div>
          </div>
          {spend && (
            <p className="text-xs text-muted-foreground border-t pt-3">
              {spend.monthLabel}: ${spend.currentSpend.toFixed(2)} spent of $
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
        </CardContent>
      </Card>

      <Card id="api-keys">
        <CardHeader>
          <CardTitle>API keys</CardTitle>
          <CardDescription>
            Stored encrypted at rest (AES-256-GCM). Reveal to copy; the plaintext is never
            cached.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {PROVIDERS.map((provider) => {
            const info = state.keys[provider];
            const showPlain = reveal[provider] && info?.plaintext;
            return (
              <div key={provider} className="space-y-2 border-b pb-4 last:border-b-0 last:pb-0">
                <div className="flex items-center justify-between">
                  <Label>{PROVIDER_LABELS[provider]} API key</Label>
                  {info && (
                    <span className="text-xs text-muted-foreground">
                      {showPlain ? info.plaintext : info.masked}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    placeholder={info ? 'Replace existing key…' : 'Paste API key'}
                    value={keyDrafts[provider]}
                    onChange={(e) =>
                      setKeyDrafts({ ...keyDrafts, [provider]: e.target.value })
                    }
                    autoComplete="off"
                  />
                  <Button onClick={() => saveKey(provider)} disabled={busy}>
                    Save
                  </Button>
                </div>
                <div className="flex gap-2 text-xs">
                  {info && (
                    <>
                      <button
                        type="button"
                        onClick={() => toggleReveal(provider)}
                        className="underline text-muted-foreground hover:text-foreground"
                      >
                        {showPlain ? 'Hide' : 'Reveal'}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeKey(provider)}
                        className="underline text-destructive hover:opacity-80"
                      >
                        Remove
                      </button>
                    </>
                  )}
                  {!info && <span className="text-muted-foreground">Not configured</span>}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
      <RoleManagementSection />
      <AvatarSettingsSection />
    </div>
  );
}
