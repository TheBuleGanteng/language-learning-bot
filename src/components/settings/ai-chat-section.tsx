'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BaseLanguageUseControl } from '@/components/settings/base-language-use-control';
import { CaptionsToggle } from '@/components/settings/captions-toggle';
import {
  CaptionLanguageSelect,
  resolveCaptionLanguage,
  type CaptionLanguage,
} from '@/components/settings/caption-language-select';
import { InfoIcon } from '@/components/ui/info-icon';
import { withBase } from '@/lib/base-path';
import { languageName, normalizeLanguageCode, type LanguageCode } from '@/lib/languages';
import {
  defaultBaseLanguageUse,
  isBaseLanguageUse,
  type BaseLanguageUse,
} from '@/lib/base-language-use';

type Role = 'regular' | 'admin' | 'superuser';

const DEFAULT_TIMEOUT_SECONDS = 120;
const MIN_SECONDS = 30;
const MAX_SECONDS = 1800;
const STEP_SECONDS = 30;

const TIMEOUT_OPTIONS: number[] = [];
for (let s = MIN_SECONDS; s <= MAX_SECONDS; s += STEP_SECONDS) TIMEOUT_OPTIONS.push(s);

// 30 → "30 sec.", 60 → "1 min.", 90 → "1 min. 30 sec.".
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  const parts: string[] = [];
  if (mins > 0) parts.push(`${mins} min.`);
  if (rem > 0) parts.push(`${rem} sec.`);
  return parts.length > 0 ? parts.join(' ') : '0 sec.';
}

/**
 * "AI Chat" settings section. Houses the per-user "Base language use" control
 * (visible to all users) and the global inactivity-timeout dropdown (relocated
 * here; superuser-only). Both auto-save on change.
 */
export function AiChatSection() {
  const [role, setRole] = useState<Role | null>(null);
  const [targetName, setTargetName] = useState('the target language');
  const [baseName, setBaseName] = useState('your base language');
  const [baseLanguageUse, setBaseLanguageUse] = useState<BaseLanguageUse>(
    defaultBaseLanguageUse(),
  );
  const [blReady, setBlReady] = useState(false);
  const [blSaving, setBlSaving] = useState(false);

  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [captionsSaving, setCaptionsSaving] = useState(false);

  const [targetCode, setTargetCode] = useState<LanguageCode>('th');
  const [captionLanguage, setCaptionLanguage] = useState<CaptionLanguage>('target');
  const [captionLangSaving, setCaptionLangSaving] = useState(false);

  const [timeoutSeconds, setTimeoutSeconds] = useState<number>(DEFAULT_TIMEOUT_SECONDS);
  const [timeoutSaving, setTimeoutSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [meRes, settingsRes] = await Promise.all([
        fetch(withBase('/api/me')),
        fetch(withBase('/api/settings')),
      ]);
      if (cancelled) return;
      let code: LanguageCode = 'th';
      if (meRes.ok) {
        const me = await meRes.json();
        setRole(me.role as Role);
        code = normalizeLanguageCode(me.targetLanguage);
        setTargetCode(code);
        setTargetName(languageName(me.targetLanguage) || 'the target language');
        setBaseName(languageName(me.nativeLanguage) || 'your base language');
      }
      if (settingsRes.ok) {
        const s = await settingsRes.json();
        if (isBaseLanguageUse(s.baseLanguageUse)) setBaseLanguageUse(s.baseLanguageUse);
        setCaptionsEnabled(Boolean(s.captionsEnabled));
        setCaptionLanguage(resolveCaptionLanguage(s.captionLanguage, code));
      }
      setBlReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isSuperuser = role === 'superuser';

  useEffect(() => {
    if (!isSuperuser) return;
    fetch(withBase('/api/settings/avatar'))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setTimeoutSeconds(Number(d.avatarInactivityTimeoutSeconds) || DEFAULT_TIMEOUT_SECONDS);
      })
      .catch(() => {});
  }, [isSuperuser]);

  async function saveBaseLanguageUse(next: BaseLanguageUse) {
    const prev = baseLanguageUse;
    setBaseLanguageUse(next);
    setBlSaving(true);
    try {
      const res = await fetch(withBase('/api/settings'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseLanguageUse: next }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error ?? 'Save failed');
      toast.success('Base language use saved');
    } catch (e) {
      setBaseLanguageUse(prev);
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBlSaving(false);
    }
  }

  async function saveCaptions(next: boolean) {
    const prev = captionsEnabled;
    setCaptionsEnabled(next);
    setCaptionsSaving(true);
    try {
      const res = await fetch(withBase('/api/settings'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ captionsEnabled: next }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error ?? 'Save failed');
      toast.success(`Captions ${next ? 'on' : 'off'}`);
    } catch (e) {
      setCaptionsEnabled(prev);
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setCaptionsSaving(false);
    }
  }

  async function saveCaptionLanguage(next: CaptionLanguage) {
    const prev = captionLanguage;
    setCaptionLanguage(next);
    setCaptionLangSaving(true);
    try {
      const res = await fetch(withBase('/api/settings'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ captionLanguage: next }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error ?? 'Save failed');
      toast.success('Caption language saved');
    } catch (e) {
      setCaptionLanguage(prev);
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setCaptionLangSaving(false);
    }
  }

  async function saveTimeout(next: number) {
    if (next === timeoutSeconds) return;
    const prev = timeoutSeconds;
    setTimeoutSeconds(next);
    setTimeoutSaving(true);
    try {
      const res = await fetch(withBase('/api/settings/avatar'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarInactivityTimeoutSeconds: next }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error ?? 'Save failed');
      toast.success('Inactivity timeout saved');
    } catch (e) {
      setTimeoutSeconds(prev);
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setTimeoutSaving(false);
    }
  }

  return (
    <Card id="ai-chat">
      <CardHeader>
        <CardTitle>AI Chat</CardTitle>
        <CardDescription>
          Settings for the AI tutor conversation (text and Kruu Bingo voice chat).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="max-w-md">
          {blReady ? (
            <BaseLanguageUseControl
              value={baseLanguageUse}
              onChange={saveBaseLanguageUse}
              targetLanguage={targetName}
              baseLanguage={baseName}
              disabled={blSaving}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
        </div>

        {/* Voice chat captions on/off (per-user, mirrors the voice page). */}
        <div className="space-y-2 border-t pt-6">
          <div className="flex items-center gap-1.5">
            <Label>Voice chat captions</Label>
            <InfoIcon label="About captions">
              Show on-screen captions of the conversation — both what you say and the
              tutor&apos;s replies. Mirrors the CC button on the voice chat page.
            </InfoIcon>
          </div>
          <CaptionsToggle
            enabled={captionsEnabled}
            onToggle={saveCaptions}
            disabled={captionsSaving}
          />

          <div className="max-w-xs space-y-1.5 pt-1">
            <div className="flex items-center gap-1.5">
              <Label>Caption language</Label>
              <InfoIcon label="About caption language">
                Choose what language captions appear in: your base language
                (translated), the target language, or — for non-Latin scripts —
                romanized target text.
              </InfoIcon>
            </div>
            <CaptionLanguageSelect
              value={captionLanguage}
              onChange={saveCaptionLanguage}
              targetCode={targetCode}
              targetName={targetName}
              baseName={baseName}
              disabled={captionLangSaving || !captionsEnabled}
            />
          </div>
        </div>

        {isSuperuser && (
          <div className="space-y-1.5 max-w-xs border-t pt-6">
            <Label htmlFor="avatar-inactivity-timeout">Inactivity timeout</Label>
            <Select
              value={String(timeoutSeconds)}
              onValueChange={(v) => v && saveTimeout(Number(v))}
              disabled={timeoutSaving}
            >
              <SelectTrigger id="avatar-inactivity-timeout">
                <SelectValue>{(value: string) => formatDuration(Number(value))}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {TIMEOUT_OPTIONS.map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {formatDuration(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              How long Kruu Bingo waits for user input before warning the user. Applies
              to all users.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
