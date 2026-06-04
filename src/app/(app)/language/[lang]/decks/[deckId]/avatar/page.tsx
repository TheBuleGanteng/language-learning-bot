'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Mic, Square, CheckCircle2, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { withBase } from '@/lib/base-path';
import { decksPath, deckFlashcardsPath, vocabPath } from '@/lib/routes';
import { languageName, normalizeLanguageCode, type LanguageCode } from '@/lib/languages';
import { KruuBingo } from '@/components/avatar/kruu-bingo';
import { NoKeyDialog } from '@/components/avatar/no-key-dialog';
import { HardStopDialog } from '@/components/avatar/hard-stop-dialog';
import { RealtimeSession } from '@/lib/realtime';
import { buildKruuBingoPrompt } from '@/lib/kruu-bingo-prompt';
import { voiceModelCostPerMinute } from '@/lib/voice-models';
import { BaseLanguageUseControl } from '@/components/settings/base-language-use-control';
import { CaptionCcMenu } from '@/components/settings/caption-cc-menu';
import {
  resolveCaptionLanguage,
  type CaptionLanguage,
} from '@/components/settings/caption-language-select';
import {
  defaultBaseLanguageUse,
  isBaseLanguageUse,
  type BaseLanguageUse,
} from '@/lib/base-language-use';

type Phase = 'loading' | 'no-key' | 'hard-stop' | 'ready' | 'completed';
type AvatarState = 'idle' | 'speaking' | 'listening';
interface Turn {
  id: number;
  role: 'user' | 'assistant';
  // The transcript text exactly as emitted, before any caption transform. The
  // displayed text is derived from this per the current caption mode.
  rawText: string;
}
interface Completion {
  durationSeconds: number;
  costUsd: number;
  turnCount: number;
}

// Seconds the warning popup counts down before auto-ending the session.
const WARNING_COUNTDOWN_SECONDS = 30;
// Fallback inactivity timeout if the settings fetch fails (matches the schema
// default).
const DEFAULT_INACTIVITY_TIMEOUT_SECONDS = 120;
// How long the green "input detected" checkmark animation holds before the
// popup dismisses and the session resumes.
const INPUT_DETECTED_HOLD_MS = 800;

/** Circular countdown indicator with the remaining seconds shown in the centre. */
function CountdownRing({ seconds, total }: { seconds: number; total: number }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, seconds / total));
  return (
    <div className="relative h-[72px] w-[72px]">
      <svg width="72" height="72" viewBox="0 0 72 72" className="-rotate-90">
        <circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          strokeWidth="6"
          className="stroke-muted"
        />
        <circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - frac)}
          className="stroke-primary transition-[stroke-dashoffset] duration-1000 ease-linear"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-lg font-semibold tabular-nums">
        {seconds}
      </span>
    </div>
  );
}

export default function AvatarPage() {
  const params = useParams<{ lang: string; deckId: string }>();
  const router = useRouter();
  const { lang, deckId } = params;

  const [phase, setPhase] = useState<Phase>('loading');
  const [hardStopLimit, setHardStopLimit] = useState(0);
  const [avatarState, setAvatarState] = useState<AvatarState>('idle');
  const [started, setStarted] = useState(false);
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const [textInput, setTextInput] = useState('');
  const [endOpen, setEndOpen] = useState(false);
  const [completion, setCompletion] = useState<Completion | null>(null);

  // Inactivity warning popup state.
  const [warnOpen, setWarnOpen] = useState(false);
  const [countdown, setCountdown] = useState(WARNING_COUNTDOWN_SECONDS);
  const [inputDetected, setInputDetected] = useState(false);

  // "Base language use" — per-user, editable live during the session (§7).
  const [baseLanguageUse, setBaseLanguageUse] = useState<BaseLanguageUse>(
    defaultBaseLanguageUse(),
  );
  const [targetName, setTargetName] = useState('the target language');
  const [baseName, setBaseName] = useState('your base language');
  const [blSaving, setBlSaving] = useState(false);

  // Captions (transcript) — per-user toggle + language mode.
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [captionsSaving, setCaptionsSaving] = useState(false);
  const [captionLanguage, setCaptionLanguage] = useState<CaptionLanguage>('target');
  const [captionLangSaving, setCaptionLangSaving] = useState(false);
  const [targetCode, setTargetCode] = useState<LanguageCode>('th');
  // Cache of transformed caption lines, keyed by `${speaker}::${mode}::${rawText}`.
  const [captionCache, setCaptionCache] = useState<Record<string, string>>({});
  // Keys currently being transformed, to avoid duplicate in-flight requests.
  const transformInFlightRef = useRef<Set<string>>(new Set());
  // Monotonic id for transcript turns (stable React keys; only ever appended).
  const turnIdRef = useRef(0);

  // Rolling-transcript scroll: container ref + whether the user is at/near the
  // bottom (drives polite auto-scroll and the scroll-to-bottom button).
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const atBottomRef = useRef(true);

  const sessionRef = useRef<RealtimeSession | null>(null);
  const promptRef = useRef<string>('');
  // Stored prompt inputs so the system prompt can be rebuilt when the base
  // language level changes mid-session (§7).
  const promptInputsRef = useRef<{
    targetLanguage: string;
    nativeLanguage: string;
    vocabItems: { targetText: string; nativeText: string; transliteration?: string | null }[];
  }>({ targetLanguage: 'the target language', nativeLanguage: 'English', vocabItems: [] });
  const savedRef = useRef(false);

  // Inactivity timer handles + the configured (global) timeout, mirrored in a
  // ref so the RealtimeSession callbacks read the latest value without being
  // re-created.
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutSecondsRef = useRef(DEFAULT_INACTIVITY_TIMEOUT_SECONDS);
  // Mirrors warnOpen / inputDetected for reads inside timer callbacks.
  const warnOpenRef = useRef(false);
  const inputDetectedRef = useRef(false);

  // §14a load sequence: config gate, then build the system prompt.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Page-load pre-check: presence of a key + spend limits. The raw key is
      // never returned; the ephemeral token is fetched on mic tap (§2c).
      const cfgRes = await fetch(withBase('/api/avatar/session-config'));
      if (cancelled) return;
      if (!cfgRes.ok) {
        toast.error('Could not start Kruu Bingo.');
        return;
      }
      const cfg = await cfgRes.json();
      if (!cfg.hasKey) {
        setPhase('no-key');
        return;
      }
      if (cfg.hardStopTriggered) {
        setHardStopLimit(Number(cfg.hardStopLimit ?? 0));
        setPhase('hard-stop');
        return;
      }
      // Remember the limit in case the token exchange reports a hard stop later.
      setHardStopLimit(Number(cfg.hardStopLimit ?? 0));
      if (cfg.warningTriggered) {
        toast.warning(
          `You've spent $${Number(cfg.monthlySpend).toFixed(2)} this month (warning threshold: $${Number(cfg.warningLimit).toFixed(2)}).`,
        );
      }

      // Fetch deck vocab + the user's languages for the system prompt, the
      // global avatar inactivity timeout (§5a), and the user's base-language
      // level (§7).
      const [studyRes, meRes, avatarRes, settingsRes] = await Promise.all([
        fetch(withBase(`/api/decks/${deckId}/study?limit=999&ahead=true`)),
        fetch(withBase('/api/me')),
        fetch(withBase('/api/settings/avatar')),
        fetch(withBase('/api/settings')),
      ]);
      if (cancelled) return;
      const study = studyRes.ok ? await studyRes.json() : { cards: [] };
      const me = meRes.ok ? await meRes.json() : { targetLanguage: lang, nativeLanguage: 'en' };
      const tCode = normalizeLanguageCode(me.targetLanguage ?? lang);
      setTargetCode(tCode);
      if (avatarRes.ok) {
        const av = await avatarRes.json();
        timeoutSecondsRef.current =
          Number(av.avatarInactivityTimeoutSeconds) || DEFAULT_INACTIVITY_TIMEOUT_SECONDS;
      }
      let level = defaultBaseLanguageUse();
      if (settingsRes.ok) {
        const s = await settingsRes.json();
        if (isBaseLanguageUse(s.baseLanguageUse)) level = s.baseLanguageUse;
        setCaptionsEnabled(Boolean(s.captionsEnabled));
        setCaptionLanguage(resolveCaptionLanguage(s.captionLanguage, tCode));
      }

      // Dedup vocab (a 'both' deck has two cards per item).
      const seen = new Set<string>();
      const vocabItems: { targetText: string; nativeText: string; transliteration?: string | null }[] = [];
      for (const c of study.cards ?? []) {
        if (seen.has(c.vocabItemId)) continue;
        seen.add(c.vocabItemId);
        vocabItems.push({
          targetText: c.targetText,
          nativeText: c.nativeText,
          transliteration: c.transliteration,
        });
      }
      const tName = languageName(me.targetLanguage ?? lang) || 'the target language';
      const bName = languageName(me.nativeLanguage ?? 'en') || 'English';
      promptInputsRef.current = { targetLanguage: tName, nativeLanguage: bName, vocabItems };
      setTargetName(tName);
      setBaseName(bName);
      setBaseLanguageUse(level);
      promptRef.current = buildKruuBingoPrompt({
        targetLanguage: tName,
        nativeLanguage: bName,
        baseLanguageUse: level,
        vocabItems,
      });
      setPhase('ready');
    })();
    return () => {
      cancelled = true;
    };
  }, [deckId, lang]);

  // Tear down on unmount — stop the session and clear any pending timers so we
  // don't leak handles or fire callbacks after the component is gone.
  useEffect(() => {
    return () => {
      void sessionRef.current?.stop();
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, []);

  const saveSession = useCallback(
    async (session: RealtimeSession): Promise<Completion> => {
      const result: Completion = {
        durationSeconds: session.getDurationSeconds(),
        costUsd: session.getEstimatedCost(),
        turnCount: session.getTurnCount(),
      };
      if (!savedRef.current) {
        savedRef.current = true;
        try {
          await fetch(withBase('/api/avatar/session'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deckId, ...result }),
          });
        } catch {
          // Non-blocking — stats are best-effort.
        }
      }
      return result;
    },
    [deckId],
  );

  // ---- inactivity timer + warning popup -------------------------------------

  const clearInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }, []);

  const clearCountdown = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  // Single shared end path (§5f): used by the manual "End session" button, the
  // popup's "End session" button, and the countdown auto-expiry. Saves the
  // session record, then shows the completion screen.
  const endSession = useCallback(async () => {
    clearInactivityTimer();
    clearCountdown();
    warnOpenRef.current = false;
    inputDetectedRef.current = false;
    setWarnOpen(false);
    setInputDetected(false);
    setEndOpen(false);

    const session = sessionRef.current;
    if (!session) {
      setCompletion({ durationSeconds: 0, costUsd: 0, turnCount: 0 });
      setPhase('completed');
      return;
    }
    const result = await saveSession(session);
    await session.stop();
    sessionRef.current = null;
    setCompletion(result);
    setPhase('completed');
  }, [saveSession, clearInactivityTimer, clearCountdown]);

  // Show the warning popup and run the 30s countdown; auto-end at zero (§5c/§5e).
  const fireInactivityWarning = useCallback(() => {
    warnOpenRef.current = true;
    inputDetectedRef.current = false;
    setInputDetected(false);
    setWarnOpen(true);
    setCountdown(WARNING_COUNTDOWN_SECONDS);
    clearCountdown();
    countdownTimerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearCountdown();
          void endSession();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [clearCountdown, endSession]);

  // (Re)start the idle timer from zero. Called when Kruu Bingo goes idle and on
  // any user input while the popup is closed.
  const startInactivityTimer = useCallback(() => {
    clearInactivityTimer();
    inactivityTimerRef.current = setTimeout(() => {
      fireInactivityWarning();
    }, timeoutSecondsRef.current * 1000);
  }, [clearInactivityTimer, fireInactivityWarning]);

  // User input detected (speech or text). If the popup is up, play the green
  // checkmark acknowledgment (§5d) then resume; otherwise just reset the timer.
  const handleUserActivity = useCallback(() => {
    if (warnOpenRef.current) {
      if (inputDetectedRef.current) return; // already acknowledging
      inputDetectedRef.current = true;
      setInputDetected(true);
      clearCountdown();
      setTimeout(() => {
        warnOpenRef.current = false;
        inputDetectedRef.current = false;
        setWarnOpen(false);
        setInputDetected(false);
        startInactivityTimer();
      }, INPUT_DETECTED_HOLD_MS);
    } else {
      startInactivityTimer();
    }
  }, [clearCountdown, startInactivityTimer]);

  // "Continue session" button — dismiss immediately, no checkmark animation.
  const continueSession = useCallback(() => {
    warnOpenRef.current = false;
    inputDetectedRef.current = false;
    setWarnOpen(false);
    setInputDetected(false);
    clearCountdown();
    startInactivityTimer();
  }, [clearCountdown, startInactivityTimer]);

  async function startSession() {
    if (started) return;
    setStarted(true);

    // GA handshake step 1: exchange the user's key for an ephemeral token
    // server-side (this fetch is inside the mic-tap user gesture).
    let ephemeralToken: string;
    // Per-minute estimate for the model the token route actually minted with,
    // so session-cost logging matches what the user was shown in settings.
    let costPerMinute: number | undefined;
    try {
      const res = await fetch(withBase('/api/avatar/token'), { method: 'POST' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        if (d.error === 'no_openai_key') setPhase('no-key');
        else if (d.error === 'hard_stop') setPhase('hard-stop');
        else if (d.error === 'openai_error')
          toast.error('Could not connect to OpenAI. Check your API key in Settings.');
        else toast.error('Connection failed. Please try again.');
        setStarted(false);
        return;
      }
      const data = await res.json();
      ephemeralToken = data.ephemeralToken;
      if (data.model) costPerMinute = voiceModelCostPerMinute(data.model);
      if (data.warning) {
        toast.warning(
          `You've spent $${Number(data.warning.monthlySpend).toFixed(2)} this month (warning threshold: $${Number(data.warning.warningLimit).toFixed(2)}).`,
        );
      }
    } catch {
      toast.error('Connection failed. Please try again.');
      setStarted(false);
      return;
    }

    const session = new RealtimeSession({
      ephemeralToken,
      costPerMinute,
      systemPrompt: promptRef.current,
      onSpeaking: () => {
        setAvatarState('speaking');
        // Kruu Bingo is talking — pause the inactivity timer entirely (§5b).
        clearInactivityTimer();
      },
      onListening: () => {
        setAvatarState('listening');
        // User speech detected — counts as input (§5b/§5d).
        handleUserActivity();
      },
      onIdle: () => {
        setAvatarState('idle');
        // Kruu Bingo finished its turn — it's the user's turn, so start the
        // idle timer from zero. Don't disturb an open warning popup.
        if (!warnOpenRef.current) startInactivityTimer();
      },
      onTranscript: (text, role) =>
        setTranscript((prev) => [...prev, { id: turnIdRef.current++, role, rawText: text }]),
      onError: (err) => {
        toast.error(err.message);
      },
      onSessionEnd: () => setAvatarState('idle'),
    });
    sessionRef.current = session;
    try {
      await session.start();
    } catch {
      // onError already surfaced the message; allow a retry.
      setStarted(false);
      sessionRef.current = null;
    }
  }

  function sendText() {
    const t = textInput.trim();
    if (!t || !sessionRef.current) return;
    sessionRef.current.sendTextMessage(t);
    setTextInput('');
    // Sending a text message counts as user input (§5b/§5d).
    handleUserActivity();
  }

  function restart() {
    clearInactivityTimer();
    clearCountdown();
    warnOpenRef.current = false;
    inputDetectedRef.current = false;
    setWarnOpen(false);
    setInputDetected(false);
    savedRef.current = false;
    setCompletion(null);
    setTranscript([]);
    setStarted(false);
    setAvatarState('idle');
    setPhase('ready');
  }

  // Base language use changed on the voice page (§7): apply to the live session
  // immediately (rebuild the prompt + push via updateInstructions), and persist
  // through the same settings PATCH so it stays in sync with the settings page.
  async function onBaseLanguageChange(level: BaseLanguageUse) {
    const prev = baseLanguageUse;
    setBaseLanguageUse(level);

    const { targetLanguage, nativeLanguage, vocabItems } = promptInputsRef.current;
    const newPrompt = buildKruuBingoPrompt({
      targetLanguage,
      nativeLanguage,
      baseLanguageUse: level,
      vocabItems,
    });
    promptRef.current = newPrompt;
    // No-ops if no session is connected yet; the value is used when it starts.
    sessionRef.current?.updateInstructions(newPrompt);

    setBlSaving(true);
    try {
      const res = await fetch(withBase('/api/settings'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseLanguageUse: level }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error ?? 'Save failed');
      }
      toast.success('Base language use saved');
    } catch (e) {
      setBaseLanguageUse(prev);
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBlSaving(false);
    }
  }

  // Captions toggle (§4c): pure client show/hide of the overlay, persisted
  // through the same settings PATCH so it mirrors the settings page.
  async function onToggleCaptions(next: boolean) {
    const prev = captionsEnabled;
    setCaptionsEnabled(next);
    setCaptionsSaving(true);
    try {
      const res = await fetch(withBase('/api/settings'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ captionsEnabled: next }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error ?? 'Save failed');
      }
      toast.success(`Captions ${next ? 'on' : 'off'}`);
    } catch (e) {
      setCaptionsEnabled(prev);
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setCaptionsSaving(false);
    }
  }

  // Caption-language change (mirrors the settings value; takes effect for
  // subsequent caption lines since rendering keys off the resolved mode).
  async function onCaptionLanguageChange(next: CaptionLanguage) {
    const prev = captionLanguage;
    setCaptionLanguage(next);
    setCaptionLangSaving(true);
    try {
      const res = await fetch(withBase('/api/settings'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ captionLanguage: next }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error ?? 'Save failed');
      }
      toast.success('Caption language saved');
    } catch (e) {
      setCaptionLanguage(prev);
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setCaptionLangSaving(false);
    }
  }

  // Resolve the effective mode defensively (§8): a stored 'target_romanized'
  // degrades to 'target' if the target language is roman-script.
  const captionMode = resolveCaptionLanguage(captionLanguage, targetCode);

  // Transform EVERY transcript turn server-side per (speaker, mode) and swap each
  // in once ready (raw text shows until then). The ONLY no-call case is the
  // tutor's line in 'target' mode (a pure passthrough). Cache by
  // speaker+mode+rawText so repeats — and switching back to a previously-used
  // mode — never re-call (and never re-bill). On a mode change this effect
  // re-runs for the whole history; most-recent turns are dispatched first so a
  // long history doesn't make the newest lines wait.
  useEffect(() => {
    if (!captionsEnabled) return;
    for (const turn of [...transcript].reverse()) {
      const speaker = turn.role === 'assistant' ? 'tutor' : 'user';
      const text = turn.rawText;
      if (!text?.trim()) continue;
      if (captionMode === 'target' && speaker === 'tutor') continue; // passthrough
      const key = `${speaker}::${captionMode}::${text}`;
      if (captionCache[key] !== undefined || transformInFlightRef.current.has(key)) continue;
      transformInFlightRef.current.add(key);
      (async () => {
        try {
          const res = await fetch(withBase('/api/avatar/caption-transform'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, mode: captionMode, speaker }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || typeof data.text !== 'string' || !data.text) {
            // Surface the failure so a silent fall-back-to-raw never again masks
            // a broken transform (e.g. missing romanization key, translate auth).
            console.error(
              `caption transform failed (${speaker}/${captionMode}, ${res.status}):`,
              data?.error ?? 'unknown error',
            );
          }
          // On any failure, cache the raw text so we keep it and don't retry.
          const out = res.ok && typeof data.text === 'string' && data.text ? data.text : text;
          setCaptionCache((prev) => ({ ...prev, [key]: out }));
        } catch (err) {
          console.error(`caption transform request error (${speaker}/${captionMode}):`, err);
          setCaptionCache((prev) => ({ ...prev, [key]: text }));
        } finally {
          transformInFlightRef.current.delete(key);
        }
      })();
    }
  }, [captionsEnabled, captionMode, transcript, captionCache]);

  // Display text for a turn under the current (speaker, mode). The tutor's line
  // in 'target' mode renders as-is (passthrough); everything else shows the
  // transformed text once ready, raw until then.
  function captionText(text: string, speaker: 'tutor' | 'user'): string {
    if (captionMode === 'target' && speaker === 'tutor') return text;
    return captionCache[`${speaker}::${captionMode}::${text}`] ?? text;
  }

  // ---- rolling-transcript scroll ----------------------------------------

  // Re-evaluate "at bottom" on every scroll (drives polite auto-scroll + button).
  const handleTranscriptScroll = useCallback(() => {
    const el = transcriptRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = distFromBottom <= 40;
    atBottomRef.current = near;
    setAtBottom(near);
  }, []);

  const scrollTranscriptToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = transcriptRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  // Polite auto-scroll: when a new turn is appended, follow it to the bottom ONLY
  // if the user was already at/near the bottom; never yank them down if they've
  // scrolled up to read history.
  useEffect(() => {
    if (atBottomRef.current) scrollTranscriptToBottom('smooth');
  }, [transcript.length, scrollTranscriptToBottom]);

  // ---- render ----------------------------------------------------------

  if (phase === 'no-key') {
    return (
      <div className="fixed inset-0 z-50 bg-background">
        <NoKeyDialog open onOpenChange={(o) => !o && router.push(decksPath(lang))} />
      </div>
    );
  }
  if (phase === 'hard-stop') {
    return (
      <div className="fixed inset-0 z-50 bg-background">
        <HardStopDialog open hardStopLimit={hardStopLimit} lang={lang} />
      </div>
    );
  }

  if (phase === 'completed' && completion) {
    const minutes = Math.max(1, Math.round(completion.durationSeconds / 60));
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background p-4 overflow-y-auto sm:static sm:z-auto sm:p-0">
        <div className="m-auto w-full max-w-md space-y-6 text-center">
          <h1 className="text-2xl font-bold">Great practice session!</h1>
          <div className="space-y-1 text-muted-foreground">
            <p>
              Duration: <span className="font-medium text-foreground">{minutes} minute{minutes === 1 ? '' : 's'}</span>
            </p>
            <p>
              Estimated cost:{' '}
              <span className="font-medium text-foreground">${completion.costUsd.toFixed(2)}</span>
            </p>
            <p>
              <span className="font-medium text-foreground">{completion.turnCount}</span> exchange
              {completion.turnCount === 1 ? '' : 's'}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Button onClick={restart}>Practice again</Button>
            <Button variant="outline" onClick={() => router.push(deckFlashcardsPath(lang, deckId))}>
              Switch to flashcards
            </Button>
            <Button variant="outline" onClick={() => router.push(decksPath(lang))}>
              Choose another deck
            </Button>
            <Button variant="outline" onClick={() => router.push(vocabPath(lang))}>
              Return to vocab
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const micLabel = !started ? 'Tap to speak' : avatarState === 'listening' ? 'Listening…' : 'Speaking with Kruu Bingo';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background p-4 sm:static sm:z-auto sm:p-0">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => router.push(decksPath(lang))} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" />
          Back to decks
        </Button>
        <span className="font-semibold">Kruu Bingo</span>
        <span className="w-24" />
      </div>

      {phase === 'loading' ? (
        <div className="m-auto text-sm text-muted-foreground">Preparing your tutor…</div>
      ) : (
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 overflow-hidden">
          {/* Avatar */}
          <div className="flex shrink-0 items-center justify-center pt-2" style={{ height: '40vh' }}>
            <KruuBingo state={avatarState} size={220} />
          </div>

          {/* Captions — the ONE caption display, gated entirely by captionsEnabled.
              OFF → nothing rendered. ON → a rolling, scrollable transcript: every
              finalized turn (tutor left / user right) accumulates in order; the
              displayed text follows the current caption mode. */}
          {captionsEnabled ? (
            <div className="relative flex-1 overflow-hidden">
              <div
                ref={transcriptRef}
                onScroll={handleTranscriptScroll}
                className="h-full space-y-2 overflow-y-auto rounded-md border bg-muted/20 p-3"
              >
                {transcript.length > 0 ? (
                  transcript.map((turn) =>
                    turn.role === 'assistant' ? (
                      <div key={turn.id} className="flex justify-start">
                        <span className="inline-block max-w-[80%] rounded-2xl border bg-background px-3 py-1.5 text-sm">
                          <span className="mr-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                            Kruu Bingo
                          </span>
                          {captionText(turn.rawText, 'tutor')}
                        </span>
                      </div>
                    ) : (
                      <div key={turn.id} className="flex justify-end">
                        <span className="inline-block max-w-[80%] rounded-2xl bg-primary px-3 py-1.5 text-sm text-primary-foreground">
                          <span className="mr-1 text-[10px] uppercase tracking-wide text-primary-foreground/70">
                            You
                          </span>
                          {captionText(turn.rawText, 'user')}
                        </span>
                      </div>
                    ),
                  )
                ) : (
                  <p className="text-center text-sm text-muted-foreground">
                    Captions will appear here as you talk.
                  </p>
                )}
              </div>

              {/* Scroll-to-bottom button — shown only when scrolled up. */}
              {!atBottom && transcript.length > 0 && (
                <button
                  type="button"
                  onClick={() => scrollTranscriptToBottom('smooth')}
                  aria-label="Scroll to latest captions"
                  className="absolute bottom-3 right-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border bg-background text-foreground shadow-md transition-colors hover:bg-accent"
                >
                  <ChevronDown className="h-5 w-5" />
                </button>
              )}
            </div>
          ) : (
            // Captions off: render nothing, just keep the layout spacer.
            <div className="flex-1" />
          )}

          {/* Text input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendText();
            }}
            className="flex shrink-0 gap-2"
          >
            <Input
              placeholder="Type a message…"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              disabled={!started}
            />
            <Button type="submit" variant="outline" disabled={!started || !textInput.trim()}>
              Send
            </Button>
          </form>

          {/* Controls — base language use (live-applied) + captions toggle. */}
          <div className="shrink-0 space-y-3 rounded-md border bg-muted/20 px-3 py-2">
            <BaseLanguageUseControl
              value={baseLanguageUse}
              onChange={onBaseLanguageChange}
              targetLanguage={targetName}
              baseLanguage={baseName}
              disabled={blSaving}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <span className="text-sm font-medium">Captions</span>
              <CaptionCcMenu
                enabled={captionsEnabled}
                onToggle={onToggleCaptions}
                captionLanguage={captionLanguage}
                onCaptionLanguageChange={onCaptionLanguageChange}
                targetCode={targetCode}
                targetName={targetName}
                baseName={baseName}
                toggleDisabled={captionsSaving}
                langDisabled={captionLangSaving}
              />
            </div>
          </div>

          {/* Mic + End */}
          <div className="flex shrink-0 flex-col gap-2 pb-2">
            <Button
              size="lg"
              onClick={startSession}
              disabled={started}
              className={cn('w-full gap-2', started && avatarState === 'listening' && 'animate-pulse')}
            >
              <Mic className="h-5 w-5" />
              {micLabel}
            </Button>
            {started && (
              <Button size="lg" variant="outline" onClick={() => setEndOpen(true)} className="w-full gap-2">
                <Square className="h-4 w-4" />
                End session
              </Button>
            )}
          </div>
        </div>
      )}

      <AlertDialog open={endOpen} onOpenChange={setEndOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End session with Kruu Bingo?</AlertDialogTitle>
            <AlertDialogDescription>
              Your practice stats will be saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep going</AlertDialogCancel>
            <Button onClick={endSession}>End session</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Inactivity warning popup (§5c–§5e). Rendered as a non-modal overlay so
          the user can still speak or send text underneath to dismiss it; the
          dimmer is pointer-events-none and only the card captures clicks. */}
      {warnOpen && (
        <div
          role="alertdialog"
          aria-modal="false"
          aria-label="Continue session?"
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
        >
          <div className="absolute inset-0 bg-black/40 pointer-events-none" aria-hidden />
          <div className="relative w-full max-w-sm rounded-xl bg-popover p-6 text-popover-foreground shadow-lg ring-1 ring-foreground/10">
            {inputDetected ? (
              <div className="flex flex-col items-center gap-3 py-6 animate-in fade-in zoom-in-95 duration-300">
                <CheckCircle2 className="h-14 w-14 text-green-600" />
                <p className="text-sm font-medium">User input detected</p>
              </div>
            ) : (
              <>
                <h2 className="text-center text-lg font-semibold">Continue session?</h2>
                <p className="mt-2 text-center text-sm text-muted-foreground">
                  You&apos;ve been quiet for a while. The session will end soon.
                </p>
                <div className="my-5 flex flex-col items-center gap-2">
                  <CountdownRing seconds={countdown} total={WARNING_COUNTDOWN_SECONDS} />
                  <p className="text-sm text-muted-foreground" aria-live="polite">
                    Ending in {countdown}s…
                  </p>
                </div>
                <div className="flex w-full flex-col gap-3 sm:flex-row">
                  <Button onClick={continueSession} className="w-full sm:flex-1 sm:min-w-0">
                    Continue session
                  </Button>
                  <Button
                    variant="outline"
                    onClick={endSession}
                    className="w-full sm:flex-1 sm:min-w-0"
                  >
                    End session
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
