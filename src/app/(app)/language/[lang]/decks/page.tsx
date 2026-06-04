'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { MessagesSquare, RefreshCw, Settings2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { withBase } from '@/lib/base-path';
import { vocabPath, deckHubPath, deckFlashcardsPath, deckAvatarPath, practicePath } from '@/lib/routes';

type Direction = 'forward' | 'reverse' | 'both';

interface LastSession {
  againCount: number;
  hardCount: number;
  goodCount: number;
  easyCount: number;
  cardsReviewed: number;
  completedAt: string;
}
interface DeckRow {
  id: string;
  name: string;
  source: 'tag' | 'lesson' | 'manual';
  sourceId: string | null;
  direction: Direction;
  lastStudiedAt: string | null;
  cardCount: number;
  dueCount: number;
  lastSession: LastSession | null;
}

const PAGE_SIZE = 25;

function formatDate(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function SessionPills({ s }: { s: LastSession | null }) {
  if (!s) return <span className="text-muted-foreground">—</span>;
  const pills: { label: string; n: number; cls: string }[] = [
    { label: 'A', n: s.againCount, cls: 'bg-red-100 text-red-700' },
    { label: 'H', n: s.hardCount, cls: 'bg-orange-100 text-orange-700' },
    { label: 'G', n: s.goodCount, cls: 'bg-green-100 text-green-700' },
    { label: 'E', n: s.easyCount, cls: 'bg-blue-100 text-blue-700' },
  ];
  return (
    <div className="flex items-center gap-1">
      {pills.map((p) => (
        <span
          key={p.label}
          className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium tabular-nums ${p.cls}`}
          title={`${p.label === 'A' ? 'Again' : p.label === 'H' ? 'Hard' : p.label === 'G' ? 'Good' : 'Easy'}: ${p.n}`}
        >
          {p.label} {p.n}
        </span>
      ))}
    </div>
  );
}

export default function FlashcardsPage() {
  const router = useRouter();
  const params = useParams<{ lang: string }>();
  const lang = params.lang;

  const [decks, setDecks] = useState<DeckRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [settingsDeck, setSettingsDeck] = useState<DeckRow | null>(null);
  const [deleteDeck, setDeleteDeck] = useState<DeckRow | null>(null);
  const [refreshState, setRefreshState] = useState<{
    deck: DeckRow;
    added: number;
    removed: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(withBase(`/api/decks?page=${p}&limit=${PAGE_SIZE}`));
      const d = await res.json();
      setDecks(d.decks ?? []);
      setTotal(d.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  async function onRefreshClick(deck: DeckRow) {
    setBusy(true);
    try {
      const res = await fetch(withBase(`/api/decks/${deck.id}/refresh`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Refresh failed');
      if ((d.added ?? 0) === 0 && (d.removed ?? 0) === 0) {
        toast.message('Deck is already up to date.');
        return;
      }
      setRefreshState({ deck, added: d.added, removed: d.removed });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Refresh failed');
    } finally {
      setBusy(false);
    }
  }

  async function confirmRefresh() {
    if (!refreshState) return;
    setBusy(true);
    try {
      const res = await fetch(withBase(`/api/decks/${refreshState.deck.id}/refresh`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Refresh failed');
      toast.success(`Deck refreshed: ${d.added} added, ${d.removed} removed.`);
      setRefreshState(null);
      void load(page);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Refresh failed');
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteDeck) return;
    setBusy(true);
    try {
      const res = await fetch(withBase(`/api/decks/${deleteDeck.id}`), { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      toast.success(`Deleted "${deleteDeck.name}".`);
      setDecks((prev) => prev.filter((d) => d.id !== deleteDeck.id));
      setTotal((t) => Math.max(0, t - 1));
      setDeleteDeck(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Flashcards</h1>
        <div className="flex items-center gap-2">
          <Button onClick={() => router.push(`${vocabPath(lang)}?mode=deck-builder`)}>
            Create new deck
          </Button>
          {/* Free conversation (§7): a deck-less Kruu Bingo voice chat. */}
          <Button
            variant="outline"
            className="gap-1.5"
            onClick={() => router.push(practicePath(lang))}
          >
            <MessagesSquare className="h-4 w-4" />
            Free conversation
          </Button>
        </div>
      </div>

      {decks.length === 0 && !loading ? (
        <div className="rounded-md border bg-muted/30 p-8 text-center text-muted-foreground">
          No decks yet. Create your first deck to get started.
        </div>
      ) : (
        <div className="w-full max-w-full border rounded-md overflow-x-auto">
          <Table className="w-full">
            <TableHeader>
              <TableRow className="bg-muted border-b-2">
                <TableHead className="font-semibold">Deck</TableHead>
                <TableHead className="w-16 text-right font-semibold">Cards</TableHead>
                <TableHead className="w-16 text-right font-semibold">Due</TableHead>
                <TableHead className="w-32 font-semibold">Last studied</TableHead>
                <TableHead className="font-semibold">Last session</TableHead>
                <TableHead className="w-28 font-semibold" />
                <TableHead className="w-20 text-right font-semibold" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {decks.map((deck) => (
                <TableRow key={deck.id}>
                  <TableCell className="font-medium align-middle">
                    {/* Deck name links to the mode chooser hub (§13). */}
                    <Link href={deckHubPath(lang, deck.id)} className="block hover:underline">
                      {deck.name}
                    </Link>
                    <span className="text-xs text-muted-foreground capitalize">
                      {deck.source} · {deck.direction}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums align-middle">
                    {deck.cardCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums align-middle">
                    {deck.dueCount > 0 ? (
                      <span className="font-medium text-foreground">{deck.dueCount}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="align-middle text-sm">
                    {formatDate(deck.lastStudiedAt)}
                  </TableCell>
                  <TableCell className="align-middle">
                    <SessionPills s={deck.lastSession} />
                  </TableCell>
                  <TableCell className="align-middle">
                    <div className="flex items-center gap-1">
                      <Button
                        size="xs"
                        variant="ghost"
                        disabled={deck.source === 'manual' || busy}
                        title={
                          deck.source === 'manual'
                            ? 'Manual decks cannot be refreshed'
                            : 'Refresh from source'
                        }
                        onClick={() => onRefreshClick(deck)}
                        aria-label="Refresh deck"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => setSettingsDeck(deck)}
                        aria-label="Deck settings"
                        title="Settings"
                      >
                        <Settings2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                        onClick={() => setDeleteDeck(deck)}
                        aria-label="Delete deck"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-right align-middle">
                    <div className="inline-flex items-center gap-1">
                      {/* Direct links bypass the mode chooser (§13). */}
                      <Button asChild size="xs">
                        <Link href={deckFlashcardsPath(lang, deck.id)}>Flashcards</Link>
                      </Button>
                      <Button asChild size="xs" variant="outline">
                        <Link href={deckAvatarPath(lang, deck.id)}>AI Chat</Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      )}

      {settingsDeck && (
        <DeckSettingsDialog
          deck={settingsDeck}
          onClose={() => setSettingsDeck(null)}
          onSaved={() => {
            setSettingsDeck(null);
            void load(page);
          }}
        />
      )}

      <AlertDialog
        open={!!refreshState}
        onOpenChange={(o) => !o && !busy && setRefreshState(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Refresh deck</AlertDialogTitle>
            <AlertDialogDescription>
              This will add {refreshState?.added ?? 0} items and remove{' '}
              {refreshState?.removed ?? 0} items. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button onClick={confirmRefresh} disabled={busy}>
              {busy ? 'Refreshing…' : 'Continue'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteDeck} onOpenChange={(o) => !o && !busy && setDeleteDeck(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete deck &quot;{deleteDeck?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button
              onClick={confirmDelete}
              disabled={busy}
              className="bg-red-600 hover:bg-red-700"
            >
              {busy ? 'Deleting…' : 'Delete'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DeckSettingsDialog({
  deck,
  onClose,
  onSaved,
}: {
  deck: DeckRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(deck.name);
  const [direction, setDirection] = useState<Direction>(deck.direction);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(withBase(`/api/decks/${deck.id}/settings`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), direction }),
      });
      if (!res.ok) throw new Error('Save failed');
      toast.success('Deck updated.');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deck settings</DialogTitle>
          <DialogDescription>
            Changing direction adds or removes the matching cards.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="deck-name">
              Deck name
            </label>
            <Input
              id="deck-name"
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <span className="text-sm font-medium">Card direction</span>
            {(
              [
                { v: 'forward', label: 'Forward only' },
                { v: 'reverse', label: 'Reverse only' },
                { v: 'both', label: 'Both' },
              ] as const
            ).map((opt) => (
              <label key={opt.v} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="deck-direction"
                  checked={direction === opt.v}
                  onChange={() => setDirection(opt.v)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !name.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
