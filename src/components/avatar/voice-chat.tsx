'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, Mic, Square, CheckCircle2, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { localeEnglishName } from '@/lib/locales';
import { KruuBingo } from '@/components/avatar/kruu-bingo';
import { NoKeyDialog } from '@/components/avatar/no-key-dialog';
import { HardStopDialog } from '@/components/avatar/hard-stop-dialog';
import { RealtimeSession, type RealtimeErrorCode } from '@/lib/realtime';
import { buildKruuBingoPrompt, buildFreeConversationPrompt } from '@/lib/kruu-bingo-prompt';
import { voiceModelCostPerMinute } from '@/lib/voice-models';
import { BaseLanguageUseControl } from '@/components/settings/base-language-use-control';
import { SpeechSpeedControl } from '@/components/settings/speech-speed-control';
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
import { defaultSpeechSpeed, isSpeechSpeed, type SpeechSpeed } from '@/lib/speech-speed';
import { useTranslations } from 'next-intl';

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

type VocabItem = { targetText: string; nativeText: string; transliteration?: string | null };

/**
 * Shared Kruu Bingo voice-chat UI. Two modes (§7):
 *  - `deck`  — grounded in a specific deck's vocabulary (requires `deckId`).
 *  - `free`  — open-ended "Free conversation", not tied to any deck.
 * The realtime voice UI, transcript/captions, sliders, inactivity handling, and
 * End-session flow are identical; only the system prompt, the data it loads, and
 * the post-session bookkeeping differ.
 */
interface VoiceChatProps {
  mode: 'deck' | 'free';
  lang: string;
  deckId?: string;
}

// Seconds the warning popup counts down before auto-ending the session.
const WARNING_COUNTDOWN_SECONDS = 30;
// Fallback inactivity timeout if the settings fetch fails (matches the schema
// default).
const DEFAULT_INACTIVITY_TIMEOUT_SECONDS = 120;
// How long the green "input detected" checkmark animation holds before the
// popup dismisses and the session resumes.
const INPUT_DETECTED_HOLD_MS = 800;

// Single place mapping realtime error codes → `practice`-namespace message keys.
// The `never` assignment is an exhaustiveness guard: adding a new RealtimeErrorCode
// without a case here becomes a compile error, so an error can't ship un-localized.
function realtimeErrorKey(code: RealtimeErrorCode): string {
  switch (code) {
    case 'mic_permission_denied':
      return 'micDenied';
    case 'connection_failed':
      return 'connectionFailed';
    case 'api_error':
      return 'apiError';
  }
  const _exhaustive: never = code;
  return _exhaustive;
}

/** Circular countdown indicator with the remaining seconds shown in the centre. */
function CountdownRing({ seconds, total }: { seconds: number; total: number }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, seconds / total));
  return (
    <div className="relative h-[72px] w-[72px]">
      <svg width="72" height="72" viewBox="0 0 72 72" className="-rotate-90">
        <circle cx="36" cy="36" r={r} fill="none" strokeWidth="6" className="stroke-muted" />
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

export function VoiceChat({ mode, lang, deckId }: VoiceChatProps) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('practice');

  const [phase, setPhase] = useState<Phase>('loading');
  const [hardStopLimit, setHardStopLimit] = useState(0);
  const [avatarState, setAvatarState] = useState<AvatarState>('idle');
  const [started, setStarted] = useState(false);
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const [endOpen, setEndOpen] = useState(false);
  const [completion, setCompletion] = useState<Completion | null>(null);

  // Inactivity warning popup state.
  const [warnOpen, setWarnOpen] = useState(false);
  const [countdown, setCountdown] = useState(WARNING_COUNTDOWN_SECONDS);
  const [inputDetected, setInputDetected] = useState(false);

  // "Base language use" + "Speech speed" — per-user, editable live during the
  // session (§7/§8).
  const [baseLanguageUse, setBaseLanguageUse] = useState<BaseLanguageUse>(
    defaultBaseLanguageUse(),
  );
  const [speechSpeed, setSpeechSpeed] = useState<SpeechSpeed>(defaultSpeechSpeed());
  const [targetName, setTargetName] = useState('the target language');
  const [baseName, setBaseName] = useState('your base language');
  const [blSaving, setBlSaving] = useState(false);
  const [ssSaving, setSsSaving] = useState(false);

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
  // Stored prompt inputs so the system prompt can be rebuilt when a slider
  // changes mid-session (§7/§8). Vocab is empty in free mode.
  const promptInputsRef = useRef<{
    targetLanguage: string;
    nativeLanguage: string;
    vocabItems: VocabItem[];
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

  // Compose the system prompt for the current mode + slider levels.
  const composePrompt = useCallback(
    (level: BaseLanguageUse, speed: SpeechSpeed) => {
      const { targetLanguage, nativeLanguage, vocabItems } = promptInputsRef.current;
      return mode === 'free'
        ? buildFreeConversationPrompt({
            targetLanguage,
            nativeLanguage,
            baseLanguageUse: level,
            speechSpeed: speed,
          })
        : buildKruuBingoPrompt({
            targetLanguage,
            nativeLanguage,
            baseLanguageUse: level,
            speechSpeed: speed,
            vocabItems,
          });
    },
    [mode],
  );

  // Load sequence: config gate, then build the system prompt.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Page-load pre-check: presence of a key + spend limits. The raw key is
      // never returned; the ephemeral token is fetched on mic tap.
      const cfgRes = await fetch(withBase('/api/avatar/session-config'));
      if (cancelled) return;
      if (!cfgRes.ok) {
        toast.error(t('couldNotStart'));
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
          t('spendWarning', {
            spent: `$${Number(cfg.monthlySpend).toFixed(2)}`,
            limit: `$${Number(cfg.warningLimit).toFixed(2)}`,
          }),
        );
      }

      // Deck vocab is only needed in deck mode; free conversation skips it.
      const studyPromise =
        mode === 'deck' && deckId
          ? fetch(withBase(`/api/decks/${deckId}/study?limit=999&ahead=true`))
          : Promise.resolve(null);
      const [studyRes, meRes, avatarRes, settingsRes] = await Promise.all([
        studyPromise,
        fetch(withBase('/api/me')),
        fetch(withBase('/api/settings/avatar')),
        fetch(withBase('/api/settings')),
      ]);
      if (cancelled) return;
      const study = studyRes && studyRes.ok ? await studyRes.json() : { cards: [] };
      const me = meRes.ok ? await meRes.json() : { targetLanguage: lang, nativeLanguage: 'en' };
      const tCode = normalizeLanguageCode(me.targetLanguage ?? lang);
      setTargetCode(tCode);
      if (avatarRes.ok) {
        const av = await avatarRes.json();
        timeoutSecondsRef.current =
          Number(av.avatarInactivityTimeoutSeconds) || DEFAULT_INACTIVITY_TIMEOUT_SECONDS;
      }
      let level = defaultBaseLanguageUse();
      let speed = defaultSpeechSpeed();
      if (settingsRes.ok) {
        const s = await settingsRes.json();
        if (isBaseLanguageUse(s.baseLanguageUse)) level = s.baseLanguageUse;
        if (isSpeechSpeed(s.speechSpeed)) speed = s.speechSpeed;
        setCaptionsEnabled(Boolean(s.captionsEnabled));
        setCaptionLanguage(resolveCaptionLanguage(s.captionLanguage, tCode));
      }

      // Dedup vocab (a 'both' deck has two cards per item).
      const seen = new Set<string>();
      const vocabItems: VocabItem[] = [];
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
      const bName = localeEnglishName(me.nativeLanguage) || 'English';
      promptInputsRef.current = { targetLanguage: tName, nativeLanguage: bName, vocabItems };
      setTargetName(tName);
      setBaseName(bName);
      setBaseLanguageUse(level);
      setSpeechSpeed(speed);
      promptRef.current = composePrompt(level, speed);
      setPhase('ready');
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, deckId, lang, composePrompt, t]);

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
          // Free conversation omits deckId — the endpoint then only logs spend
          // and does NOT touch any deck's "last studied" (§7).
          await fetch(withBase('/api/avatar/session'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...(mode === 'deck' && deckId ? { deckId } : {}), ...result }),
          });
        } catch {
          // Non-blocking — stats are best-effort.
        }
      }
      return result;
    },
    [mode, deckId],
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

  // Single shared end path: used by the manual "End session" button, the popup's
  // "End session" button, and the countdown auto-expiry. Saves the session
  // record, then shows the completion screen.
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

  // Show the warning popup and run the 30s countdown; auto-end at zero.
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

  // User input detected (speech). If the popup is up, play the green checkmark
  // acknowledgment then resume; otherwise just reset the timer.
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
          toast.error(t('couldNotConnect'));
        else toast.error(t('connectionFailed'));
        setStarted(false);
        return;
      }
      const data = await res.json();
      ephemeralToken = data.ephemeralToken;
      if (data.model) costPerMinute = voiceModelCostPerMinute(data.model);
      if (data.warning) {
        toast.warning(
          t('spendWarning', {
            spent: `$${Number(data.warning.monthlySpend).toFixed(2)}`,
            limit: `$${Number(data.warning.warningLimit).toFixed(2)}`,
          }),
        );
      }
    } catch {
      toast.error(t('connectionFailed'));
      setStarted(false);
      return;
    }

    const session = new RealtimeSession({
      ephemeralToken,
      costPerMinute,
      systemPrompt: promptRef.current,
      onSpeaking: () => {
        setAvatarState('speaking');
        // Kruu Bingo is talking — pause the inactivity timer entirely.
        clearInactivityTimer();
      },
      onListening: () => {
        setAvatarState('listening');
        // User speech detected — counts as input.
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
        toast.error(t(realtimeErrorKey(err.code)));
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

  // Base language use changed (§7): apply to the live session immediately
  // (rebuild the prompt + push via updateInstructions), and persist through the
  // settings PATCH so it stays in sync with the settings page.
  async function onBaseLanguageChange(level: BaseLanguageUse) {
    const prev = baseLanguageUse;
    setBaseLanguageUse(level);
    const newPrompt = composePrompt(level, speechSpeed);
    promptRef.current = newPrompt;
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
        throw new Error(d?.error ?? t('saveFailed'));
      }
      toast.success(t('baseSaved'));
    } catch (e) {
      setBaseLanguageUse(prev);
      promptRef.current = composePrompt(prev, speechSpeed);
      sessionRef.current?.updateInstructions(promptRef.current);
      toast.error(e instanceof Error ? e.message : t('saveFailed'));
    } finally {
      setBlSaving(false);
    }
  }

  // Speech speed changed (§8): same live-apply + persist mechanism as base
  // language use — rebuild the prompt with the new pacing and push it live.
  async function onSpeechSpeedChange(speed: SpeechSpeed) {
    const prev = speechSpeed;
    setSpeechSpeed(speed);
    const newPrompt = composePrompt(baseLanguageUse, speed);
    promptRef.current = newPrompt;
    sessionRef.current?.updateInstructions(newPrompt);

    setSsSaving(true);
    try {
      const res = await fetch(withBase('/api/settings'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speechSpeed: speed }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error ?? t('saveFailed'));
      }
      toast.success(t('speedSaved'));
    } catch (e) {
      setSpeechSpeed(prev);
      promptRef.current = composePrompt(baseLanguageUse, prev);
      sessionRef.current?.updateInstructions(promptRef.current);
      toast.error(e instanceof Error ? e.message : t('saveFailed'));
    } finally {
      setSsSaving(false);
    }
  }

  // Captions toggle: pure client show/hide of the transcript, persisted through
  // the settings PATCH so it mirrors the settings page.
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
        throw new Error(d?.error ?? t('saveFailed'));
      }
      toast.success(next ? t('captionsOn') : t('captionsOff'));
    } catch (e) {
      setCaptionsEnabled(prev);
      toast.error(e instanceof Error ? e.message : t('saveFailed'));
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
        throw new Error(d?.error ?? t('saveFailed'));
      }
      toast.success(t('captionLangSaved'));
    } catch (e) {
      setCaptionLanguage(prev);
      toast.error(e instanceof Error ? e.message : t('saveFailed'));
    } finally {
      setCaptionLangSaving(false);
    }
  }

  // Resolve the effective mode defensively: a stored 'target_romanized'
  // degrades to 'target' if the target language is roman-script.
  const captionMode = resolveCaptionLanguage(captionLanguage, targetCode);

  // Transform EVERY transcript turn server-side per (speaker, mode) and swap each
  // in once ready (raw text shows until then). The ONLY no-call case is the
  // tutor's line in 'target' mode (a pure passthrough). Cache by
  // speaker+mode+rawText so repeats — and switching back to a previously-used
  // mode — never re-call (and never re-bill).
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
            console.error(
              `caption transform failed (${speaker}/${captionMode}, ${res.status}):`,
              data?.error ?? 'unknown error',
            );
          }
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

  // Display text for a turn under the current (speaker, mode).
  function captionText(text: string, speaker: 'tutor' | 'user'): string {
    if (captionMode === 'target' && speaker === 'tutor') return text;
    return captionCache[`${speaker}::${captionMode}::${text}`] ?? text;
  }

  // ---- rolling-transcript scroll ----------------------------------------

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

  // Polite auto-scroll: follow a new turn to the bottom ONLY if the user was
  // already at/near the bottom; never yank them down if they scrolled up.
  useEffect(() => {
    if (atBottomRef.current) scrollTranscriptToBottom('smooth');
  }, [transcript.length, scrollTranscriptToBottom]);

  // ---- render ----------------------------------------------------------

  if (phase === 'no-key') {
    return (
      <div className="fixed inset-0 z-50 bg-background">
        <NoKeyDialog
          open
          returnTo={pathname}
          onOpenChange={(o) => !o && router.push(decksPath(lang))}
        />
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
          <h1 className="text-2xl font-bold">{t('greatSession')}</h1>
          <div className="space-y-1 text-muted-foreground">
            <p>
              {t('duration')}:{' '}
              <span className="font-medium text-foreground">{t('minutes', { n: minutes })}</span>
            </p>
            <p>
              {t('estCost')}:{' '}
              <span className="font-medium text-foreground">${completion.costUsd.toFixed(2)}</span>
            </p>
            <p>
              {t('exchanges', { n: completion.turnCount })}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Button onClick={restart}>{t('practiceAgain')}</Button>
            {mode === 'deck' && deckId && (
              <Button
                variant="outline"
                onClick={() => router.push(deckFlashcardsPath(lang, deckId))}
              >
                {t('switchFlashcards')}
              </Button>
            )}
            <Button variant="outline" onClick={() => router.push(decksPath(lang))}>
              {mode === 'deck' ? t('chooseDeck') : t('backToDecks')}
            </Button>
            <Button variant="outline" onClick={() => router.push(vocabPath(lang))}>
              {t('returnVocab')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const micLabel = !started
    ? t('tapToSpeak')
    : avatarState === 'listening'
      ? t('listening')
      : t('speaking');

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background p-4 sm:static sm:z-auto sm:p-0 sm:-mb-10">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(decksPath(lang))}
          className="gap-1.5"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('backToDecks')}
        </Button>
        <span className="font-semibold">{mode === 'free' ? t('freeTitle') : t('title')}</span>
        <span className="w-24" />
      </div>

      {phase === 'loading' ? (
        <div className="m-auto text-sm text-muted-foreground">{t('preparing')}</div>
      ) : (
        <div className="mx-auto flex w-full max-w-xl flex-1 min-h-0 flex-col gap-3 overflow-y-auto sm:gap-2">
          {/* Avatar */}
          <div className="relative flex h-[30vh] shrink-0 items-center justify-center pt-2 sm:h-[28vh] sm:pt-0">
            <KruuBingo state={avatarState} size={220} />
            {/* The CC control is overlaid top-right of the avatar on all widths
                (the labeled "Captions" row is removed), saving vertical space. */}
            <div className="absolute right-1 top-1">
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

          {/* Captions — the ONE caption display, gated entirely by captionsEnabled. */}
          {captionsEnabled ? (
            // Bounded height so the box scrolls internally instead of growing the
            // page: capped at 45vh, with a min height so it never collapses, and
            // free to shrink below the cap when vertical space is tight (mobile).
            <div className="relative flex-1 min-h-32 max-h-[45vh] overflow-hidden">
              <div
                ref={transcriptRef}
                onScroll={handleTranscriptScroll}
                className="max-h-[45vh] space-y-2 overflow-y-auto rounded-md border bg-muted/20 p-3"
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
                    {t('captionsPlaceholder')}
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

          {/* Controls — base language use + speech speed (both live-applied).
              The CC control lives over the avatar (above) on all widths. */}
          <div className="shrink-0 space-y-2 rounded-md border bg-muted/20 px-3 py-2">
            <BaseLanguageUseControl
              value={baseLanguageUse}
              onChange={onBaseLanguageChange}
              targetLanguage={targetName}
              baseLanguage={baseName}
              disabled={blSaving}
              compact
            />
            <div className="border-t pt-2">
              <SpeechSpeedControl
                value={speechSpeed}
                onChange={onSpeechSpeedChange}
                disabled={ssSaving}
                compact
              />
            </div>
          </div>

          {/* Mic + End */}
          <div className="flex shrink-0 flex-col gap-2 pb-2 sm:pb-0">
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
              <Button
                size="lg"
                variant="outline"
                onClick={() => setEndOpen(true)}
                className="w-full gap-2"
              >
                <Square className="h-4 w-4" />
                {t('endSession')}
              </Button>
            )}
          </div>
        </div>
      )}

      <AlertDialog open={endOpen} onOpenChange={setEndOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('endConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('endConfirmDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('keepGoing')}</AlertDialogCancel>
            <Button onClick={endSession}>{t('endSession')}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Inactivity warning popup — rendered as a non-modal overlay so the user
          can still speak underneath to dismiss it; the dimmer is
          pointer-events-none and only the card captures clicks. */}
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
                <p className="text-sm font-medium">{t('inputDetected')}</p>
              </div>
            ) : (
              <>
                <h2 className="text-center text-lg font-semibold">{t('continueTitle')}</h2>
                <p className="mt-2 text-center text-sm text-muted-foreground">
                  {t('continueBody')}
                </p>
                <div className="my-5 flex flex-col items-center gap-2">
                  <CountdownRing seconds={countdown} total={WARNING_COUNTDOWN_SECONDS} />
                  <p className="text-sm text-muted-foreground" aria-live="polite">
                    {t('endingIn', { n: countdown })}
                  </p>
                </div>
                <div className="flex w-full flex-col gap-3 sm:flex-row">
                  <Button onClick={continueSession} className="w-full sm:flex-1 sm:min-w-0">
                    {t('continueSession')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={endSession}
                    className="w-full sm:flex-1 sm:min-w-0"
                  >
                    {t('endSession')}
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
