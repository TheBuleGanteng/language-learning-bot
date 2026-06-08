'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { toast } from 'sonner';
import {
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  ChevronUp,
  Trash2,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { NewLessonDialog } from '@/components/new-lesson-dialog';
import { DeleteLessonDialog } from '@/components/delete-lesson-dialog';
import { LessonsBulkShareDialog } from '@/components/lessons/bulk-share-dialog';
import { LessonVisibilityBadge } from '@/components/lessons/visibility-badge';
import { DisplayNameGate } from '@/components/display-name-gate';
import { canShare, type UserRole } from '@/lib/roles';
import { lessonPath } from '@/lib/routes';
import { stripHtml } from '@/lib/strip-html';
import { sortLessons } from '@/lib/lessons-sort';
import { withBase } from '@/lib/base-path';
import { ReorderProvider, SortableRow, DragHandle, type ReorderMove } from '@/components/dnd/sortable';

interface LessonRow {
  id: string;
  name: string;
  lessonNumber: number | null;
  topic: string | null;
  date: string | null;
  vocabCount: number;
  visibility: 'private' | 'partial' | 'shared';
}

type SortCol = 'name' | 'topic' | 'date' | 'vocab_count';
type SortOrder = 'asc' | 'desc';

const COLS: { id: SortCol; tkey: string; className?: string }[] = [
  { id: 'name', tkey: 'colName' },
  { id: 'topic', tkey: 'colTopic' },
  { id: 'date', tkey: 'colDate' },
  { id: 'vocab_count', tkey: 'colVocab', className: 'text-right' },
];

function formatDate(d: string | null, locale: string): string {
  if (!d) return '—';
  try {
    return new Date(`${d}T00:00:00`).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return d;
  }
}

interface Props {
  lang: string;
}

export function LessonsIndexClient({ lang }: Props) {
  const router = useRouter();
  const t = useTranslations('lessons');
  const tc = useTranslations('common');
  const locale = useLocale();
  const [rows, setRows] = useState<LessonRow[]>([]);
  const [loading, setLoading] = useState(true);
  // null sortCol = the default view (Z→A natural by name, Part 4.1), or the
  // server's manual drag order when manualOrder is true.
  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [manualOrder, setManualOrder] = useState(false);
  const [newLessonOpen, setNewLessonOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [me, setMe] = useState<{ role: UserRole; displayName: string | null } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [refetch, setRefetch] = useState(0);

  useEffect(() => {
    fetch(withBase('/api/me'))
      .then((r) => r.json())
      .then((d) => setMe({ role: d.role, displayName: d.displayName }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (sortCol) {
      qs.set('sort', sortCol);
      qs.set('order', sortOrder);
    }
    fetch(withBase(`/api/lessons?${qs.toString()}`))
      .then((r) => r.json())
      .then((d: { lessons: LessonRow[]; manualOrder?: boolean }) => {
        setRows(d.lessons ?? []);
        setManualOrder(d.manualOrder ?? false);
      })
      .finally(() => setLoading(false));
  }, [sortCol, sortOrder, refetch]);

  const canShareLessons = !!me && canShare(me.role);

  // Default order is Z→A natural by name (Part 4.1). With an active manual drag
  // order, keep the server's position order. With an explicit column sort, sort
  // client-side (numeric-aware) by that column.
  const displayedRows = useMemo(() => {
    if (sortCol) return sortLessons(rows, sortCol, sortOrder);
    if (manualOrder) return rows;
    return sortLessons(rows, 'name', 'desc');
  }, [rows, sortCol, sortOrder, manualOrder]);

  function toggleSelected(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  // Activating any sort control clears the manual drag order (Part 3.2).
  function clearLessonOrder() {
    if (!manualOrder) return;
    setManualOrder(false);
    fetch(withBase('/api/lessons/order'), { method: 'DELETE' }).catch(() => {});
  }

  function cycleSort(col: SortCol) {
    clearLessonOrder();
    if (sortCol !== col) {
      setSortCol(col);
      setSortOrder('asc');
    } else if (sortOrder === 'asc') {
      setSortOrder('desc');
    } else {
      setSortCol(null);
    }
  }

  function sortIcon(col: SortCol) {
    if (sortCol !== col) {
      return <ChevronsUpDown className="ml-1 inline h-3.5 w-3.5 opacity-40" />;
    }
    return sortOrder === 'asc' ? (
      <ChevronUp className="ml-1 inline h-3.5 w-3.5" />
    ) : (
      <ChevronDown className="ml-1 inline h-3.5 w-3.5" />
    );
  }

  // Drag-to-reorder (Part 3): optimistic reorder, then persist the single move.
  async function handleMove({ movedId, beforeId, afterId, newIds }: ReorderMove) {
    const byId = new Map(rows.map((r) => [r.id, r]));
    const prev = rows;
    const reordered = newIds.map((id) => byId.get(id)).filter((r): r is LessonRow => !!r);
    setRows(reordered);
    setManualOrder(true);
    try {
      const res = await fetch(withBase('/api/lessons/order'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movedId, beforeId, afterId }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setRows(prev);
      toast.error('Could not save the new order');
    }
  }

  async function bulkDelete() {
    const idArr = Array.from(selectedIds);
    if (idArr.length === 0) return;
    setBulkDeleting(true);
    try {
      const res = await fetch(withBase('/api/lessons/bulk'), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonIds: idArr }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? 'Failed to delete');
      const skippedIds: string[] = d.skippedIds ?? [];
      const skippedSet = new Set(skippedIds);
      const skippedMsg =
        d.skipped > 0 ? ` ${d.skipped} skipped (not your content).` : '';
      toast.success(`Deleted ${d.deleted} lesson${d.deleted === 1 ? '' : 's'}.${skippedMsg}`);
      // Drop the deleted rows; keep any that were skipped.
      setRows((prev) => prev.filter((r) => !selectedIds.has(r.id) || skippedSet.has(r.id)));
      setSelectedIds(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete');
    } finally {
      setBulkDeleting(false);
      setShowBulkDeleteConfirm(false);
    }
  }

  const selectedCount = selectedIds.size;

  const selectionActions = (
    <>
      {canShareLessons && (
        <DisplayNameGate userDisplayName={me?.displayName ?? null}>
          <Button size="xs" variant="outline" onClick={() => setShowShareDialog(true)}>
            {t('shareUnshare')}
          </Button>
        </DisplayNameGate>
      )}
      <Button
        size="xs"
        variant="outline"
        className="text-red-600 hover:bg-red-50 hover:text-red-700"
        onClick={() => setShowBulkDeleteConfirm(true)}
      >
        <Trash2 className="mr-1 h-3.5 w-3.5" />
        {tc('delete')}
      </Button>
    </>
  );

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <Button size="sm" onClick={() => setNewLessonOpen(true)}>
          {t('newLesson')}
        </Button>
      </header>

      <NewLessonDialog open={newLessonOpen} onOpenChange={setNewLessonOpen} lang={lang} />

      {deleteTarget && (
        <DeleteLessonDialog
          open={!!deleteTarget}
          onOpenChange={(o) => {
            if (!o) setDeleteTarget(null);
          }}
          lessonId={deleteTarget.id}
          lessonName={deleteTarget.name}
          onDeleted={() => {
            setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
            setDeleteTarget(null);
          }}
        />
      )}

      {/* Desktop selection bar (top). */}
      {selectedCount > 0 && (
        <div className="sticky top-0 z-10 hidden items-center gap-2 flex-wrap rounded-md border bg-background p-2 shadow-sm md:flex">
          <span className="text-sm font-medium">{t('selected', { count: selectedCount })}</span>
          {selectionActions}
          <Button
            size="xs"
            variant="ghost"
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto"
          >
            {t('clearSelection')}
          </Button>
        </div>
      )}

      {showShareDialog && (
        <LessonsBulkShareDialog
          open={showShareDialog}
          onOpenChange={setShowShareDialog}
          lessonIds={Array.from(selectedIds)}
          onDone={() => {
            setSelectedIds(new Set());
            setRefetch((c) => c + 1);
          }}
        />
      )}

      <AlertDialog open={showBulkDeleteConfirm} onOpenChange={(o) => !bulkDeleting && setShowBulkDeleteConfirm(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedCount} lesson{selectedCount === 1 ? '' : 's'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the selected lessons and their files, links, and lesson
              associations. Vocab items are kept. Lessons you didn&apos;t create are skipped.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                bulkDelete();
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              {bulkDeleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mobile (< md): stacked card per lesson — no horizontal scroll. */}
      <div className="space-y-3 md:hidden">
        <ReorderProvider
          ids={displayedRows.map((r) => r.id)}
          onMove={handleMove}
          disabled={sortCol !== null}
        >
          {displayedRows.map((r) => (
            <SortableRow key={r.id} id={r.id}>
              {({ setNodeRef, style, handleProps }) => (
                <div
                  ref={setNodeRef}
                  style={style}
                  className="rounded-lg border bg-card p-4 active:bg-muted/40"
                  onClick={() => router.push(lessonPath(lang, r.id))}
                >
                  <div className="flex items-start gap-2">
                    <span onClick={(e) => e.stopPropagation()} className="pt-0.5">
                      <DragHandle handleProps={handleProps} />
                    </span>
                    <span className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(r.id)}
                        onCheckedChange={(c) => toggleSelected(r.id, c === true)}
                        aria-label={t('selectAria', { name: r.name })}
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium break-words text-blue-700 dark:text-blue-400">
                        {r.name}
                      </p>
                      {r.topic && (
                        <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                          {stripHtml(r.topic)}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          {t('colDate')}: {formatDate(r.date, locale)}
                        </span>
                        <span>
                          {t('colVocab')}: {r.vocabCount}
                        </span>
                        {canShareLessons && (
                          <span className="inline-flex items-center gap-1">
                            {t('colVisibility')}: <LessonVisibilityBadge status={r.visibility} />
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label={t('deleteAria')}
                      className="shrink-0 p-2 text-muted-foreground/50 hover:text-red-600"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget({ id: r.id, name: r.name });
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </SortableRow>
          ))}
        </ReorderProvider>
        {rows.length === 0 && !loading && (
          <div className="rounded-md border bg-muted/30 p-8 text-center text-muted-foreground">
            {t('empty')}
          </div>
        )}
      </div>

      {/* Desktop (md+): the full table. */}
      <div className="hidden rounded-md border overflow-x-auto md:block">
        <ReorderProvider
          ids={displayedRows.map((r) => r.id)}
          onMove={handleMove}
          disabled={sortCol !== null}
        >
        <Table>
          <TableHeader>
            <TableRow className="bg-muted border-b-2">
              <TableHead className="w-8" />
              <TableHead className="w-10" />
              {COLS.map((c) => (
                <TableHead
                  key={c.id}
                  onClick={() => cycleSort(c.id)}
                  className={`font-semibold cursor-pointer select-none hover:bg-muted-foreground/10 ${c.className ?? ''}`}
                >
                  {t(c.tkey)}
                  {sortIcon(c.id)}
                </TableHead>
              ))}
              {canShareLessons && (
                <TableHead className="font-semibold">{t('colVisibility')}</TableHead>
              )}
            </TableRow>
          </TableHeader>
            <TableBody>
              {displayedRows.map((r) => (
                <SortableRow key={r.id} id={r.id}>
                  {({ setNodeRef, style, handleProps }) => (
                    <TableRow
                      ref={setNodeRef}
                      style={style}
                      className="cursor-pointer hover:bg-muted/50 active:bg-muted/70 transition-colors"
                      onClick={() => router.push(lessonPath(lang, r.id))}
                    >
                      <TableCell className="w-8 align-top" onClick={(e) => e.stopPropagation()}>
                        <DragHandle handleProps={handleProps} />
                      </TableCell>
                      <TableCell className="w-10 align-top" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(r.id)}
                          onCheckedChange={(c) => toggleSelected(r.id, c === true)}
                          aria-label={t('selectAria', { name: r.name })}
                        />
                      </TableCell>
                      <TableCell className="whitespace-normal break-words align-top">
                        <span className="font-medium text-blue-700 dark:text-blue-400 hover:underline">
                          {r.name}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-normal break-words align-top text-muted-foreground">
                        {r.topic ? <span className="line-clamp-2">{stripHtml(r.topic)}</span> : '—'}
                      </TableCell>
                      <TableCell className="align-top">{formatDate(r.date, locale)}</TableCell>
                      <TableCell className="align-top text-right tabular-nums">
                        {r.vocabCount}
                      </TableCell>
                      {canShareLessons && (
                        <TableCell className="align-top text-xs">
                          <LessonVisibilityBadge status={r.visibility} />
                        </TableCell>
                      )}
                      <TableCell className="w-8 align-top">
                        <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                      </TableCell>
                      <TableCell className="w-8 align-top">
                        <button
                          type="button"
                          aria-label={t('deleteAria')}
                          className="text-muted-foreground/40 hover:text-red-600 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget({ id: r.id, name: r.name });
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </TableCell>
                    </TableRow>
                  )}
                </SortableRow>
              ))}
              {rows.length === 0 && !loading && (
                <TableRow>
                  <TableCell
                    colSpan={COLS.length + 4 + (canShareLessons ? 1 : 0)}
                    className="text-center py-8 text-muted-foreground"
                  >
                    {t('empty')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
        </Table>
        </ReorderProvider>
      </div>

      {/* Mobile (< md): sticky bottom selection bar. */}
      {selectedCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex flex-wrap items-center gap-2 border-t bg-background px-4 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] md:hidden">
          <span className="text-sm font-medium">{t('selected', { count: selectedCount })}</span>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {selectionActions}
            <Button size="xs" variant="ghost" onClick={() => setSelectedIds(new Set())}>
              {t('clearSelection')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
