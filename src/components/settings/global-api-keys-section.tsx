'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { withBase } from '@/lib/base-path';

type Provider = 'anthropic' | 'openai' | 'google';
const PROVIDERS: { id: Provider; label: string }[] = [
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'google', label: 'Google' },
];

type Status = Record<Provider, { hasKey: boolean }>;
const EMPTY_FIELDS: Record<Provider, string> = { anthropic: '', openai: '', google: '' };
const EMPTY_BOOLS: Record<Provider, boolean> = { anthropic: false, openai: false, google: false };

/**
 * Global API keys (superuser-only — rendered only inside the superuser-gated
 * User management card). Same reveal / replace / remove mechanics as the
 * personal keys section; values are fetched on explicit reveal and never sent in
 * a list payload. Each endpoint is independently superuser-gated server-side.
 */
export function GlobalApiKeysSection() {
  const t = useTranslations('globalApiKeys');
  const tc = useTranslations('common');
  const [status, setStatus] = useState<Status | null>(null);
  const [values, setValues] = useState<Record<Provider, string>>(EMPTY_FIELDS);
  const [revealed, setRevealed] = useState<Record<Provider, boolean>>(EMPTY_BOOLS);
  const [busy, setBusy] = useState<Provider | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(withBase('/api/settings/global-keys'));
      if (!res.ok) return;
      const d = await res.json();
      setStatus(d.keys as Status);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  async function reveal(provider: Provider) {
    if (revealed[provider]) {
      // Hide: clear the fetched value and mask again.
      setRevealed((p) => ({ ...p, [provider]: false }));
      setValues((p) => ({ ...p, [provider]: '' }));
      return;
    }
    setBusy(provider);
    try {
      const res = await fetch(withBase('/api/settings/global-keys/reveal'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t('revealFailed'));
      setValues((p) => ({ ...p, [provider]: d.value ?? '' }));
      setRevealed((p) => ({ ...p, [provider]: true }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('revealFailed'));
    } finally {
      setBusy(null);
    }
  }

  async function save(provider: Provider) {
    setBusy(provider);
    try {
      const res = await fetch(withBase('/api/settings/global-keys'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, value: values[provider] }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t('saveFailed'));
      toast.success(t('saved'));
      setValues((p) => ({ ...p, [provider]: '' }));
      setRevealed((p) => ({ ...p, [provider]: false }));
      await loadStatus();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('saveFailed'));
    } finally {
      setBusy(null);
    }
  }

  async function remove(provider: Provider) {
    setBusy(provider);
    try {
      const res = await fetch(withBase('/api/settings/global-keys'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, value: null }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t('saveFailed'));
      toast.success(t('removed'));
      setValues((p) => ({ ...p, [provider]: '' }));
      setRevealed((p) => ({ ...p, [provider]: false }));
      await loadStatus();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('saveFailed'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('desc')}</p>
      {PROVIDERS.map(({ id, label }) => {
        const hasKey = status?.[id].hasKey ?? false;
        const isRevealed = revealed[id];
        return (
          <div key={id} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`global-key-${id}`}>{label}</Label>
              <span className={hasKey ? 'text-xs text-green-600 dark:text-green-500' : 'text-xs text-muted-foreground'}>
                {hasKey ? t('set') : t('notSet')}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Input
                  id={`global-key-${id}`}
                  type={isRevealed ? 'text' : 'password'}
                  value={values[id]}
                  placeholder={t('placeholder')}
                  autoComplete="off"
                  onChange={(e) => setValues((p) => ({ ...p, [id]: e.target.value }))}
                  className="pr-9"
                />
                {hasKey && (
                  <button
                    type="button"
                    aria-label={isRevealed ? t('hide') : t('reveal')}
                    onClick={() => reveal(id)}
                    disabled={busy === id}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {isRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                )}
              </div>
              <Button
                size="sm"
                disabled={busy === id || !values[id].trim()}
                onClick={() => save(id)}
              >
                {tc('save')}
              </Button>
              {hasKey && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === id}
                  onClick={() => remove(id)}
                >
                  {tc('remove')}
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
