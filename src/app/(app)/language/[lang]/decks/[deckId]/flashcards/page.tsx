'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { withBase } from '@/lib/base-path';
import { decksPath, vocabPath } from '@/lib/routes';

interface StudyCard {
  cardReviewId: string;
  direction: 'forward' | 'reverse';
  state: string;
  dueAt: string;
  vocabItemId: string;
  targetText: string;
  nativeText: string;
  transliteration: string | null;
  imageUrl: string | null;
}

interface StudyResponse {
  cards: StudyCard[];
  total: number;
  dueCount: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

type Mode = 'loading' | 'studying' | 'nothing-due' | 'complete';

const LIMIT = 25;

interface SessionStats {
  againCount: number;
  hardCount: number;
  goodCount: number;
  easyCount: number;
  cardsReviewed: number;
}
const ZERO_STATS: SessionStats = {
  againCount: 0,
  hardCount: 0,
  goodCount: 0,
  easyCount: 0,
  cardsReviewed: 0,
};

const RATINGS: { value: 1 | 2 | 3 | 4; label: string; cls: string; key: keyof SessionStats }[] = [
  { value: 1, label: 'Again', cls: 'bg-red-600 hover:bg-red-700', key: 'againCount' },
  { value: 2, label: 'Hard', cls: 'bg-orange-500 hover:bg-orange-600', key: 'hardCount' },
  { value: 3, label: 'Good', cls: 'bg-green-600 hover:bg-green-700', key: 'goodCount' },
  { value: 4, label: 'Easy', cls: 'bg-blue-600 hover:bg-blue-700', key: 'easyCount' },
];

export default function StudyPage() {
  const params = useParams<{ lang: string; deckId: string }>();
  const router = useRouter();
  const { lang, deckId } = params;

  const [mode, setMode] = useState<Mode>('loading');
  const [cards, setCards] = useState<StudyCard[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [ahead, setAhead] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [nextDueAt, setNextDueAt] = useState<string | null>(null);
  const [stats, setStats] = useState<SessionStats>(ZERO_STATS);
  const [submitting, setSubmitting] = useState(false);

  // Guard so the completion screen posts the session exactly once.
  const sessionPostedRef = useRef(false);

  const fetchStudy = useCallback(
    async (p: number, aheadMode: boolean): Promise<StudyResponse | null> => {
      const res = await fetch(
        withBase(`/api/decks/${deckId}/study?page=${p}&limit=${LIMIT}&ahead=${aheadMode}`),
      );
      if (!res.ok) return null;
      return (await res.json()) as StudyResponse;
    },
    [deckId],
  );

  // Initial load: due cards only.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await fetchStudy(1, false);
      if (cancelled) return;
      if (!data) {
        toast.error('Failed to load deck.');
        return;
      }
      if (data.dueCount === 0 || data.cards.length === 0) {
        // Nothing due — fetch the earliest upcoming card for the "next due" hint.
        const aheadData = await fetchStudy(1, true);
        if (cancelled) return;
        setNextDueAt(aheadData?.cards[0]?.dueAt ?? null);
        setMode('nothing-due');
        return;
      }
      setCards(data.cards);
      setHasMore(data.hasMore);
      setSessionTotal(data.total);
      setPage(1);
      setAhead(false);
      setMode('studying');
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchStudy]);

  const startStudying = useCallback(
    async (aheadMode: boolean) => {
      setMode('loading');
      const data = await fetchStudy(1, aheadMode);
      if (!data || data.cards.length === 0) {
        const aheadData = aheadMode ? data : await fetchStudy(1, true);
        setNextDueAt(aheadData?.cards[0]?.dueAt ?? null);
        setMode('nothing-due');
        return;
      }
      setCards(data.cards);
      setHasMore(data.hasMore);
      setSessionTotal(data.total);
      setPage(1);
      setAhead(aheadMode);
      setIndex(0);
      setFlipped(false);
      setStats(ZERO_STATS);
      sessionPostedRef.current = false;
      setMode('studying');
    },
    [fetchStudy],
  );

  const postSession = useCallback(
    async (finalStats: SessionStats) => {
      if (sessionPostedRef.current) return;
      sessionPostedRef.current = true;
      try {
        await fetch(withBase(`/api/decks/${deckId}/session`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(finalStats),
        });
      } catch {
        // Best-effort — stats are non-critical.
      }
    },
    [deckId],
  );

  async function rate(value: 1 | 2 | 3 | 4, statKey: keyof SessionStats) {
    if (submitting) return;
    const current = cards[index];
    if (!current) return;
    setSubmitting(true);
    try {
      const res = await fetch(withBase(`/api/decks/${deckId}/rate`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardReviewId: current.cardReviewId, rating: value }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error('Failed to save rating. Try again.');
      setSubmitting(false);
      return;
    }

    const nextStats: SessionStats = {
      ...stats,
      [statKey]: stats[statKey] + 1,
      cardsReviewed: stats.cardsReviewed + 1,
    };
    setStats(nextStats);
    setFlipped(false);

    const atEndOfLoaded = index + 1 >= cards.length;
    if (atEndOfLoaded && hasMore) {
      const data = await fetchStudy(page + 1, ahead);
      if (data && data.cards.length > 0) {
        setCards((prev) => [...prev, ...data.cards]);
        setHasMore(data.hasMore);
        setPage((p) => p + 1);
        setIndex((i) => i + 1);
        setSubmitting(false);
        return;
      }
    }
    if (atEndOfLoaded) {
      // No more cards — finish.
      await postSession(nextStats);
      setMode('complete');
      setSubmitting(false);
      return;
    }
    setIndex((i) => i + 1);
    setSubmitting(false);
  }

  const backButton = (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => router.push(decksPath(lang))}
      className="gap-1.5"
    >
      <ArrowLeft className="h-4 w-4" />
      Back
    </Button>
  );

  // On mobile this fixed layer covers the app navbar; on sm+ it sits inline.
  const shellClass =
    'fixed inset-0 z-50 flex flex-col bg-background p-4 overflow-y-auto sm:static sm:z-auto sm:p-0';

  if (mode === 'loading') {
    return (
      <div className={shellClass}>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (mode === 'nothing-due') {
    return (
      <div className={shellClass}>
        <div className="sm:hidden">{backButton}</div>
        <div className="m-auto max-w-md space-y-4 text-center">
          <h1 className="text-xl font-semibold">All caught up!</h1>
          <p className="text-muted-foreground">No cards are due right now.</p>
          {nextDueAt && (
            <p className="text-sm text-muted-foreground">
              Next card due: {new Date(nextDueAt).toLocaleString()}
            </p>
          )}
          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-center">
            <Button onClick={() => startStudying(true)}>Study ahead</Button>
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

  if (mode === 'complete') {
    return <CompletionScreen stats={stats} lang={lang} onContinue={() => startStudying(true)} />;
  }

  // mode === 'studying'
  const card = cards[index];
  if (!card) {
    return (
      <div className={shellClass}>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const isForward = card.direction === 'forward';
  // Front: forward shows native (prompt for target); reverse shows target (+image).
  const progressDone = stats.cardsReviewed;
  const progressTotal = Math.max(sessionTotal, progressDone + 1);
  const progressPct = Math.min(100, Math.round((progressDone / progressTotal) * 100));

  return (
    <div className={shellClass}>
      <div className="flex items-center justify-between sm:hidden">{backButton}</div>

      <div className="mx-auto w-full max-w-xl flex-1 flex flex-col">
        {/* Progress */}
        <div className="space-y-1 pt-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              Card {Math.min(progressDone + 1, progressTotal)} of {progressTotal}
            </span>
            <span className="hidden sm:inline">{ahead ? 'Studying ahead' : 'Due cards'}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-primary transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Card */}
        <div className="flex-1 flex items-center justify-center py-6">
          <button
            type="button"
            onClick={() => !flipped && setFlipped(true)}
            className="w-full"
            style={{ perspective: '1000px' }}
            aria-label={flipped ? 'Card answer' : 'Show answer'}
            key={card.cardReviewId}
          >
            <div
              className="relative w-full min-h-[16rem] animate-in fade-in slide-in-from-right-8"
              style={{
                transformStyle: 'preserve-3d',
                WebkitTransformStyle: 'preserve-3d',
                transition: 'transform 0.4s',
                transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
              }}
            >
              {/* Front */}
              <CardFace>
                <CardContent
                  primaryText={isForward ? card.nativeText : card.targetText}
                  transliteration={isForward ? null : card.transliteration}
                  imageUrl={isForward ? null : card.imageUrl}
                  prompt={isForward ? 'What is the target word for this?' : 'What does this mean?'}
                />
              </CardFace>
              {/* Back */}
              <CardFace back>
                <CardContent
                  primaryText={isForward ? card.targetText : card.nativeText}
                  transliteration={isForward ? card.transliteration : null}
                  imageUrl={isForward ? card.imageUrl : null}
                  prompt={null}
                />
              </CardFace>
            </div>
          </button>
        </div>

        {/* Controls */}
        <div className="pb-2">
          {!flipped ? (
            <Button className="w-full" size="lg" onClick={() => setFlipped(true)}>
              Show answer
            </Button>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {RATINGS.map((r) => (
                <Button
                  key={r.value}
                  size="lg"
                  disabled={submitting}
                  onClick={() => rate(r.value, r.key)}
                  className={`text-white ${r.cls}`}
                >
                  {r.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CardFace({
  children,
  back = false,
}: {
  children: React.ReactNode;
  back?: boolean;
}) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center rounded-xl border bg-card p-6 shadow-sm"
      style={{
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        transform: back ? 'rotateY(180deg)' : 'rotateY(0deg)',
      }}
    >
      {children}
    </div>
  );
}

function CardContent({
  primaryText,
  transliteration,
  imageUrl,
  prompt,
}: {
  primaryText: string;
  transliteration: string | null;
  imageUrl: string | null;
  prompt: string | null;
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          className="max-h-40 w-auto rounded-md border object-contain"
        />
      )}
      <div className="text-2xl font-semibold break-words">{primaryText}</div>
      {transliteration && (
        <div className="text-sm text-muted-foreground">{transliteration}</div>
      )}
      {prompt && <div className="text-xs text-muted-foreground">{prompt}</div>}
    </div>
  );
}

function CompletionScreen({
  stats,
  lang,
  onContinue,
}: {
  stats: SessionStats;
  lang: string;
  onContinue: () => void;
}) {
  const router = useRouter();
  const bars: { label: string; n: number; cls: string }[] = [
    { label: 'Again', n: stats.againCount, cls: 'bg-red-600' },
    { label: 'Hard', n: stats.hardCount, cls: 'bg-orange-500' },
    { label: 'Good', n: stats.goodCount, cls: 'bg-green-600' },
    { label: 'Easy', n: stats.easyCount, cls: 'bg-blue-600' },
  ];
  const max = Math.max(1, ...bars.map((b) => b.n));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background p-4 overflow-y-auto sm:static sm:z-auto sm:p-0">
      <div className="m-auto w-full max-w-md space-y-6 text-center">
        <h1 className="text-2xl font-bold">Session complete! 🎉</h1>
        <p className="text-muted-foreground">
          Cards reviewed: <span className="font-semibold text-foreground">{stats.cardsReviewed}</span>
        </p>

        <div className="space-y-2 text-left">
          {bars.map((b) => (
            <div key={b.label} className="flex items-center gap-2 text-sm">
              <span className="w-12 shrink-0">{b.label}</span>
              <div className="h-4 flex-1 rounded bg-muted overflow-hidden">
                <div
                  className={`h-4 ${b.cls}`}
                  style={{ width: `${Math.round((b.n / max) * 100)}%` }}
                />
              </div>
              <span className="w-6 shrink-0 text-right tabular-nums">{b.n}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-center">
          <Button onClick={onContinue}>Continue studying</Button>
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
