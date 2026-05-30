'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { withBase } from '@/lib/base-path';
import { decksPath } from '@/lib/routes';
import { languageName } from '@/lib/languages';

type Direction = 'forward' | 'reverse' | 'both';

interface ExistingDeck {
  id: string;
  name: string;
  cardCount: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lang: string;
  vocabIds: string[];
  /** Detected source from the active vocab filters (null = manual). */
  activeTag: { id: string; name: string } | null;
  activeLesson: { id: string; name: string } | null;
  /**
   * Deck-builder mode (launched from the Flashcards page): force source =
   * manual and default to the New-deck tab only.
   */
  forceManual?: boolean;
  /** Called after a successful create/add so the parent can clear selection. */
  onDone: () => void;
}

export function AddToDeckDialog({
  open,
  onOpenChange,
  lang,
  vocabIds,
  activeTag,
  activeLesson,
  forceManual = false,
  onDone,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<'new' | 'existing'>('new');
  const [name, setName] = useState('');
  const [direction, setDirection] = useState<Direction>('forward');
  const [busy, setBusy] = useState(false);

  const [existing, setExisting] = useState<ExistingDeck[] | null>(null);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);

  // Source detection (§8a): a single tag filter → tag; a single lesson filter →
  // lesson; otherwise manual. Deck-builder mode always forces manual (§7b).
  const detected: { source: 'tag' | 'lesson' | 'manual'; id: string | null; label: string } =
    forceManual
      ? { source: 'manual', id: null, label: 'Manual (not refreshable)' }
      : activeTag && !activeLesson
        ? { source: 'tag', id: activeTag.id, label: `Tag '${activeTag.name}' (refreshable)` }
        : activeLesson && !activeTag
          ? {
              source: 'lesson',
              id: activeLesson.id,
              label: `Lesson '${activeLesson.name}' (refreshable)`,
            }
          : { source: 'manual', id: null, label: 'Manual (not refreshable)' };

  const targetLabel = languageName(lang) || 'target';

  useEffect(() => {
    if (open) {
      setTab('new');
      setName('');
      setDirection('forward');
      setSelectedDeckId(null);
      setExisting(null);
    }
  }, [open]);

  // Lazy-load the existing decks when that tab is first opened.
  useEffect(() => {
    if (open && tab === 'existing' && existing === null) {
      fetch(withBase('/api/decks?limit=200'))
        .then((r) => (r.ok ? r.json() : { decks: [] }))
        .then((d) => setExisting(d.decks ?? []));
    }
  }, [open, tab, existing]);

  async function createDeck() {
    setBusy(true);
    try {
      const res = await fetch(withBase('/api/decks'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          vocabItemIds: vocabIds,
          source: detected.source,
          sourceId: detected.id,
          direction,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Failed to create deck');
      toast.success(`Deck '${d.name}' created with ${d.cardCount} card${d.cardCount === 1 ? '' : 's'}.`);
      onOpenChange(false);
      onDone();
      router.push(decksPath(lang));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create deck');
    } finally {
      setBusy(false);
    }
  }

  async function addToExisting() {
    if (!selectedDeckId) return;
    const deck = existing?.find((x) => x.id === selectedDeckId);
    setBusy(true);
    try {
      const res = await fetch(withBase(`/api/decks/${selectedDeckId}/items`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vocabItemIds: vocabIds }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Failed to add items');
      const deckName = deck?.name ?? 'deck';
      toast.success(
        d.skipped > 0
          ? `Added ${d.added} items to '${deckName}'. ${d.skipped} duplicates skipped.`
          : `Added ${d.added} items to '${deckName}'.`,
      );
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add items');
    } finally {
      setBusy(false);
    }
  }

  const directions: { v: Direction; label: string }[] = [
    { v: 'forward', label: `Forward (Native → ${targetLabel})` },
    { v: 'reverse', label: `Reverse (${targetLabel} → Native)` },
    { v: 'both', label: 'Both (interleaved)' },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{forceManual ? 'Create deck' : 'Add to deck'}</DialogTitle>
          <DialogDescription>
            {vocabIds.length} item{vocabIds.length === 1 ? '' : 's'} selected.
          </DialogDescription>
        </DialogHeader>

        {!forceManual && (
          <div className="flex gap-1 rounded-md bg-muted p-1 text-sm">
            {(
              [
                { v: 'new', label: 'New deck' },
                { v: 'existing', label: 'Add to existing deck' },
              ] as const
            ).map((t) => (
              <button
                key={t.v}
                type="button"
                onClick={() => setTab(t.v)}
                className={cn(
                  'flex-1 rounded px-2 py-1 transition-colors',
                  tab === t.v
                    ? 'bg-background shadow-sm font-medium'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {tab === 'new' ? (
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="new-deck-name">
                Deck name
              </label>
              <Input
                id="new-deck-name"
                value={name}
                maxLength={100}
                placeholder="e.g. Animals"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <span className="text-sm font-medium">Direction</span>
              {directions.map((opt) => (
                <label
                  key={opt.v}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <input
                    type="radio"
                    name="new-deck-direction"
                    checked={direction === opt.v}
                    onChange={() => setDirection(opt.v)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Source: {detected.label}</p>
          </div>
        ) : (
          <div className="space-y-2 py-1 max-h-64 overflow-y-auto">
            {existing === null ? (
              <p className="text-sm text-muted-foreground">Loading decks…</p>
            ) : existing.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No decks yet — create one in the New deck tab.
              </p>
            ) : (
              existing.map((deck) => (
                <label
                  key={deck.id}
                  className="flex items-center gap-2 text-sm cursor-pointer rounded px-1 py-1 hover:bg-muted"
                >
                  <input
                    type="radio"
                    name="existing-deck"
                    checked={selectedDeckId === deck.id}
                    onChange={() => setSelectedDeckId(deck.id)}
                  />
                  <span className="flex-1">{deck.name}</span>
                  <span className="text-xs text-muted-foreground">{deck.cardCount} cards</span>
                </label>
              ))
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          {tab === 'new' ? (
            <Button onClick={createDeck} disabled={busy || !name.trim() || vocabIds.length === 0}>
              {busy ? 'Creating…' : 'Create deck'}
            </Button>
          ) : (
            <Button onClick={addToExisting} disabled={busy || !selectedDeckId}>
              {busy ? 'Adding…' : 'Add to deck'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
