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
import { MODELS, PROVIDERS, type Provider } from '@/lib/models';
import { LANGUAGES, UNLOCKED_TARGET_LANGUAGES, type LanguageCode } from '@/lib/languages';
import { useRouter } from 'next/navigation';

interface KeyInfo {
  masked: string;
  plaintext: string | null;
}

interface SettingsState {
  llmProvider: Provider;
  llmModel: string;
  targetLanguage: LanguageCode;
  nativeLanguage: LanguageCode;
  keys: Record<Provider, KeyInfo | null>;
}

const PROVIDER_LABELS: Record<Provider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
};

export default function SettingsPage() {
  const router = useRouter();
  const [state, setState] = useState<SettingsState | null>(null);
  const [busy, setBusy] = useState(false);

  // Per-row input state for the key editors
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
    const url = revealProvider ? `/api/settings?reveal=${revealProvider}` : '/api/settings';
    const res = await fetch(url);
    if (!res.ok) {
      toast.error('Failed to load settings');
      return;
    }
    setState((await res.json()) as SettingsState);
  }

  useEffect(() => {
    load();
  }, []);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch('/api/settings', {
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

  async function onProviderChange(p: Provider) {
    if (!state) return;
    const newModel = MODELS[p].find((m) => m.isDefault)?.id ?? MODELS[p][0]!.id;
    setState({ ...state, llmProvider: p, llmModel: newModel });
  }

  async function onModelChange(modelId: string) {
    if (!state) return;
    setState({ ...state, llmModel: modelId });
  }

  async function saveLlm() {
    if (!state) return;
    const ok = await patch({ llmProvider: state.llmProvider, llmModel: state.llmModel });
    if (ok) toast.success('LLM settings saved');
  }

  async function saveKey(provider: Provider) {
    const value = keyDrafts[provider].trim();
    if (!value) {
      toast.error('Enter a key first');
      return;
    }
    const ok = await patch({ apiKey: { provider, value } });
    if (ok) {
      toast.success(`${PROVIDER_LABELS[provider]} key saved`);
      setKeyDrafts({ ...keyDrafts, [provider]: '' });
      await load();
    }
  }

  async function removeKey(provider: Provider) {
    const ok = await patch({ apiKey: { provider, value: null } });
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
    // Fetch with reveal=provider then mark as revealed locally
    const res = await fetch(`/api/settings?reveal=${provider}`);
    if (!res.ok) {
      toast.error('Failed to fetch key');
      return;
    }
    setState((await res.json()) as SettingsState);
    setReveal({ ...reveal, [provider]: true });
  }

  async function onLanguageChange(field: 'targetLanguage' | 'nativeLanguage', code: LanguageCode) {
    if (!state) return;
    const ok = await patch({ [field]: code });
    if (ok) {
      setState({ ...state, [field]: code });
      toast.success('Saved');
      // Trigger layout re-render to refresh the top-nav links and any other
      // language-dependent UI.
      router.refresh();
    }
  }

  if (!state) return <p className="text-sm text-muted-foreground">Loading settings…</p>;

  return (
    <div className="space-y-6 max-w-2xl">
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
              <Label>Target language</Label>
              <Select
                value={state.targetLanguage}
                onValueChange={(v) => v && onLanguageChange('targetLanguage', v as LanguageCode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => {
                    const unlocked = UNLOCKED_TARGET_LANGUAGES.includes(l.code);
                    return (
                      <SelectItem key={l.code} value={l.code} disabled={!unlocked}>
                        {l.name}
                        {!unlocked && ' (coming soon)'}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Native language</Label>
              <Select
                value={state.nativeLanguage}
                onValueChange={(v) => v && onLanguageChange('nativeLanguage', v as LanguageCode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.name}
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
          <CardTitle>LLM provider</CardTitle>
          <CardDescription>
            Choose which model the AI tutor uses. Each user can pick independently.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Provider</Label>
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
              <Label>Model</Label>
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
          <Button onClick={saveLlm} disabled={busy}>
            Save
          </Button>
        </CardContent>
      </Card>

      <Card>
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
    </div>
  );
}
