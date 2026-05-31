'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Mic, Square } from 'lucide-react';
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
import { languageName } from '@/lib/languages';
import { KruuBingo } from '@/components/avatar/kruu-bingo';
import { NoKeyDialog } from '@/components/avatar/no-key-dialog';
import { HardStopDialog } from '@/components/avatar/hard-stop-dialog';
import { RealtimeSession } from '@/lib/realtime';
import { buildKruuBingoPrompt } from '@/lib/kruu-bingo-prompt';

type Phase = 'loading' | 'no-key' | 'hard-stop' | 'ready' | 'completed';
type AvatarState = 'idle' | 'speaking' | 'listening';
interface Turn {
  role: 'user' | 'assistant';
  text: string;
}
interface Completion {
  durationSeconds: number;
  costUsd: number;
  turnCount: number;
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

  const sessionRef = useRef<RealtimeSession | null>(null);
  const promptRef = useRef<string>('');
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const savedRef = useRef(false);

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

      // Fetch deck vocab + the user's languages for the system prompt.
      const [studyRes, meRes] = await Promise.all([
        fetch(withBase(`/api/decks/${deckId}/study?limit=999&ahead=true`)),
        fetch(withBase('/api/me')),
      ]);
      if (cancelled) return;
      const study = studyRes.ok ? await studyRes.json() : { cards: [] };
      const me = meRes.ok ? await meRes.json() : { targetLanguage: lang, nativeLanguage: 'en' };

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
      promptRef.current = buildKruuBingoPrompt({
        targetLanguage: languageName(me.targetLanguage ?? lang) || 'the target language',
        nativeLanguage: languageName(me.nativeLanguage ?? 'en') || 'English',
        vocabItems,
      });
      setPhase('ready');
    })();
    return () => {
      cancelled = true;
    };
  }, [deckId, lang]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  // Tear down on unmount.
  useEffect(() => {
    return () => {
      void sessionRef.current?.stop();
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

  async function startSession() {
    if (started) return;
    setStarted(true);

    // GA handshake step 1: exchange the user's key for an ephemeral token
    // server-side (this fetch is inside the mic-tap user gesture).
    let ephemeralToken: string;
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
      systemPrompt: promptRef.current,
      onSpeaking: () => setAvatarState('speaking'),
      onListening: () => setAvatarState('listening'),
      onIdle: () => setAvatarState('idle'),
      onTranscript: (text, role) => setTranscript((prev) => [...prev, { role, text }]),
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

  async function confirmEnd() {
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
  }

  function sendText() {
    const t = textInput.trim();
    if (!t || !sessionRef.current) return;
    sessionRef.current.sendTextMessage(t);
    setTextInput('');
  }

  function restart() {
    savedRef.current = false;
    setCompletion(null);
    setTranscript([]);
    setStarted(false);
    setAvatarState('idle');
    setPhase('ready');
  }

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

          {/* Transcript */}
          <div className="flex-1 overflow-y-auto rounded-md border bg-muted/20 p-3 space-y-2">
            {transcript.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground">
                {started
                  ? 'Say hello to Kruu Bingo!'
                  : 'Tap the mic to start your conversation.'}
              </p>
            ) : (
              transcript.map((t, i) => (
                <div
                  key={i}
                  className={cn('flex', t.role === 'user' ? 'justify-end' : 'justify-start')}
                >
                  <span
                    className={cn(
                      'inline-block max-w-[80%] rounded-2xl px-3 py-1.5 text-sm',
                      t.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background border',
                    )}
                  >
                    {t.text}
                  </span>
                </div>
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>

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
            <Button onClick={confirmEnd}>End session</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
