'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('decks');
  const tc = useTranslations('common');

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
        toast.message(t('upToDate'));
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
      toast.success(t('refreshDone', { added: d.added, removed: d.removed }));
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
      toast.success(t('deleted', { name: deleteDeck.name }));
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => router.push(`${vocabPath(lang)}?mode=deck-builder`)}>
            {t('createDeck')}
          </Button>
          {/* Free conversation (§7): a deck-less Kruu Bingo voice chat. */}
          <Button
            variant="outline"
            className="gap-1.5"
            onClick={() => router.push(practicePath(lang))}
          >
            <MessagesSquare className="h-4 w-4" />
            {t('freeConversation')}
          </Button>
        </div>
      </div>

      {decks.length === 0 && !loading ? (
        <div className="rounded-md border bg-muted/30 p-8 text-center text-muted-foreground">
          {t('empty')}
        </div>
      ) : (
        <>
        {/* Mobile (< md): stacked card per deck — no horizontal scroll. */}
        <div className="space-y-3 md:hidden">
          {decks.map((deck) => (
            <div key={deck.id} className="space-y-3 rounded-lg border bg-card p-4">
              <div className="min-w-0">
                <Link href={deckHubPath(lang, deck.id)} className="font-medium break-words hover:underline">
                  {deck.name}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {t(deck.source === 'manual' ? 'srcManual' : deck.source === 'tag' ? 'srcTag' : 'srcLesson')}{' '}
                  · {t(deck.direction === 'forward' ? 'dirForward' : deck.direction === 'reverse' ? 'dirReverse' : 'dirBoth')}
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">{t('colCards')}</dt>
                  <dd className="tabular-nums">{deck.cardCount}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">{t('colDue')}</dt>
                  <dd className="tabular-nums font-medium">{deck.dueCount}</dd>
                </div>
                <div className="col-span-2 flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">{t('colLastStudied')}</dt>
                  <dd>{deck.lastStudiedAt ? formatDate(deck.lastStudiedAt) : tc('never')}</dd>
                </div>
                <div className="col-span-2 flex items-center justify-between gap-2">
                  <dt className="shrink-0 text-muted-foreground">{t('colLastSession')}</dt>
                  <dd className="min-w-0"><SessionPills s={deck.lastSession} /></dd>
                </div>
              </dl>
              <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                <Button asChild size="sm" className="min-w-[7rem] flex-1">
                  <Link href={deckFlashcardsPath(lang, deck.id)}>{t('flashcardsBtn')}</Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="min-w-[7rem] flex-1">
                  <Link href={deckAvatarPath(lang, deck.id)}>{t('aiChatBtn')}</Link>
                </Button>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-10 w-10"
                    disabled={deck.source === 'manual' || busy}
                    title={deck.source === 'manual' ? t('manualNoRefresh') : t('refreshFromSource')}
                    aria-label={t('refreshAria')}
                    onClick={() => onRefreshClick(deck)}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-10 w-10"
                    aria-label={t('deckSettings')}
                    title={t('deckSettings')}
                    onClick={() => setSettingsDeck(deck)}
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-10 w-10 text-red-600 hover:bg-red-50 hover:text-red-700"
                    aria-label={t('deleteAria')}
                    title={t('deleteAria')}
                    onClick={() => setDeleteDeck(deck)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop (md+): the full table. */}
        <div className="hidden w-full max-w-full overflow-x-auto rounded-md border md:block">
          <Table className="w-full">
            <TableHeader>
              <TableRow className="bg-muted border-b-2">
                <TableHead className="font-semibold">{t('colDeck')}</TableHead>
                <TableHead className="w-16 text-right font-semibold">{t('colCards')}</TableHead>
                <TableHead className="w-16 text-right font-semibold">{t('colDue')}</TableHead>
                <TableHead className="w-32 font-semibold">{t('colLastStudied')}</TableHead>
                <TableHead className="font-semibold">{t('colLastSession')}</TableHead>
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
                    <span className="text-xs text-muted-foreground">
                      {t(
                        deck.source === 'manual'
                          ? 'srcManual'
                          : deck.source === 'tag'
                            ? 'srcTag'
                            : 'srcLesson',
                      )}{' '}
                      ·{' '}
                      {t(
                        deck.direction === 'forward'
                          ? 'dirForward'
                          : deck.direction === 'reverse'
                            ? 'dirReverse'
                            : 'dirBoth',
                      )}
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
                    {deck.lastStudiedAt ? formatDate(deck.lastStudiedAt) : tc('never')}
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
                            ? t('manualNoRefresh')
                            : t('refreshFromSource')
                        }
                        onClick={() => onRefreshClick(deck)}
                        aria-label={t('refreshAria')}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => setSettingsDeck(deck)}
                        aria-label={t('deckSettings')}
                        title={t('deckSettings')}
                      >
                        <Settings2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                        onClick={() => setDeleteDeck(deck)}
                        aria-label={t('deleteAria')}
                        title={t('deleteAria')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-right align-middle">
                    <div className="inline-flex items-center gap-1">
                      {/* Direct links bypass the mode chooser (§13). */}
                      <Button asChild size="xs">
                        <Link href={deckFlashcardsPath(lang, deck.id)}>{t('flashcardsBtn')}</Link>
                      </Button>
                      <Button asChild size="xs" variant="outline">
                        <Link href={deckAvatarPath(lang, deck.id)}>{t('aiChatBtn')}</Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        </>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            {tc('previous')}
          </Button>
          <span className="text-muted-foreground">
            {tc('pageOf', { page, total: totalPages })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            {tc('next')}
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
            <AlertDialogTitle>{t('refreshDeck')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('refreshConfirm', { added: refreshState?.added ?? 0, removed: refreshState?.removed ?? 0 })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button onClick={confirmRefresh} disabled={busy}>
              {busy ? t('refreshing') : tc('continue')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteDeck} onOpenChange={(o) => !o && !busy && setDeleteDeck(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteTitle', { name: deleteDeck?.name ?? '' })}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button
              onClick={confirmDelete}
              disabled={busy}
              className="bg-red-600 hover:bg-red-700"
            >
              {busy ? tc('deleting') : tc('delete')}
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
  const t = useTranslations('decks');
  const tc = useTranslations('common');
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
      toast.success(t('updated'));
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
          <DialogTitle>{t('deckSettings')}</DialogTitle>
          <DialogDescription>
            {t('deckSettingsDesc')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="deck-name">
              {t('deckName')}
            </label>
            <Input
              id="deck-name"
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <span className="text-sm font-medium">{t('cardDirection')}</span>
            {(
              [
                { v: 'forward', label: t('forwardOnly') },
                { v: 'reverse', label: t('reverseOnly') },
                { v: 'both', label: t('both') },
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
            {tc('cancel')}
          </Button>
          <Button onClick={save} disabled={saving || !name.trim()}>
            {saving ? tc('saving') : tc('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
