'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Layers, MessagesSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { withBase } from '@/lib/base-path';
import { decksPath, deckFlashcardsPath, deckAvatarPath } from '@/lib/routes';
import { NoKeyDialog } from '@/components/avatar/no-key-dialog';

interface DeckInfo {
  id: string;
  name: string;
  cardCount: number;
  dueCount: number;
}

/**
 * Deck mode-chooser hub (§3). Reached only by direct navigation to
 * /decks/[deckId]; the Study/Practice buttons elsewhere link to the
 * mode-specific URLs and bypass this page.
 */
export default function DeckHubPage() {
  const params = useParams<{ lang: string; deckId: string }>();
  const router = useRouter();
  const { lang, deckId } = params;

  const [deck, setDeck] = useState<DeckInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasOpenAiKey, setHasOpenAiKey] = useState(false);
  const [noKeyOpen, setNoKeyOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [decksRes, settingsRes] = await Promise.all([
          fetch(withBase('/api/decks?limit=200')),
          fetch(withBase('/api/settings')),
        ]);
        const decksData = decksRes.ok ? await decksRes.json() : { decks: [] };
        const found = (decksData.decks ?? []).find(
          (d: DeckInfo) => d.id === deckId,
        );
        setDeck(found ?? null);
        if (settingsRes.ok) {
          const s = await settingsRes.json();
          setHasOpenAiKey(!!s?.keys?.openai);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [deckId]);

  function onPractice() {
    if (hasOpenAiKey) router.push(deckAvatarPath(lang, deckId));
    else setNoKeyOpen(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background p-4 overflow-y-auto sm:static sm:z-auto sm:p-0">
      <div>
        <Button variant="ghost" size="sm" asChild className="gap-1.5">
          <Link href={decksPath(lang)}>
            <ArrowLeft className="h-4 w-4" />
            Back to decks
          </Link>
        </Button>
      </div>

      <div className="m-auto w-full max-w-md space-y-6 text-center">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !deck ? (
          <p className="text-sm text-muted-foreground">Deck not found.</p>
        ) : (
          <>
            <div className="space-y-1">
              <h1 className="text-2xl font-bold">{deck.name}</h1>
              <p className="text-muted-foreground">
                {deck.cardCount} card{deck.cardCount === 1 ? '' : 's'} · {deck.dueCount} due
              </p>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => router.push(deckFlashcardsPath(lang, deckId))}
                className="flex w-full items-center gap-4 rounded-xl border bg-card p-5 text-left shadow-sm transition-colors hover:border-primary hover:bg-accent"
              >
                <Layers className="h-8 w-8 shrink-0 text-primary" />
                <span className="flex flex-col">
                  <span className="text-lg font-semibold">Flashcards</span>
                  <span className="text-sm text-muted-foreground">
                    Review with spaced repetition
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={onPractice}
                className="flex w-full items-center gap-4 rounded-xl border bg-card p-5 text-left shadow-sm transition-colors hover:border-primary hover:bg-accent"
              >
                <MessagesSquare className="h-8 w-8 shrink-0 text-primary" />
                <span className="flex flex-col">
                  <span className="text-lg font-semibold">Practice with Kruu Bingo</span>
                  <span className="text-sm text-muted-foreground">
                    Speak and listen with your AI tutor
                  </span>
                </span>
              </button>
            </div>
          </>
        )}
      </div>

      <NoKeyDialog open={noKeyOpen} onOpenChange={setNoKeyOpen} />
    </div>
  );
}
