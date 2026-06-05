'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
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
import { withBase } from '@/lib/base-path';

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
  const locale = useLocale();
  const [rows, setRows] = useState<LessonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [newLessonOpen, setNewLessonOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [me, setMe] = useState<{ role: UserRole; displayName: string | null } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showShareDialog, setShowShareDialog] = useState(false);
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
      .then((d: { lessons: LessonRow[] }) => setRows(d.lessons ?? []))
      .finally(() => setLoading(false));
  }, [sortCol, sortOrder, refetch]);

  const canShareLessons = !!me && canShare(me.role);

  function toggleSelected(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function cycleSort(col: SortCol) {
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

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <Button size="sm" onClick={() => setNewLessonOpen(true)}>
          {t('newLesson')}
        </Button>
      </header>

      <NewLessonDialog
        open={newLessonOpen}
        onOpenChange={setNewLessonOpen}
        lang={lang}
      />

      {deleteTarget && (
        <DeleteLessonDialog
          open={!!deleteTarget}
          onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
          lessonId={deleteTarget.id}
          lessonName={deleteTarget.name}
          onDeleted={() => {
            setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
            setDeleteTarget(null);
          }}
        />
      )}

      {canShareLessons && selectedIds.size > 0 && (
        <div className="sticky top-0 z-10 flex items-center gap-2 flex-wrap rounded-md border bg-background p-2 shadow-sm">
          <span className="text-sm font-medium">{t('selected', { count: selectedIds.size })}</span>
          <DisplayNameGate userDisplayName={me?.displayName ?? null}>
            <Button size="xs" variant="outline" onClick={() => setShowShareDialog(true)}>
              {t('shareUnshare')}
            </Button>
          </DisplayNameGate>
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

      {/* Mobile (< md): stacked card per lesson — no horizontal scroll. */}
      <div className="space-y-3 md:hidden">
        {rows.map((r) => (
          <div
            key={r.id}
            className="rounded-lg border bg-card p-4 active:bg-muted/40"
            onClick={() => router.push(lessonPath(lang, r.id))}
          >
            <div className="flex items-start gap-3">
              {canShareLessons && (
                <span className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedIds.has(r.id)}
                    onCheckedChange={(c) => toggleSelected(r.id, c === true)}
                    aria-label={t('selectAria', { name: r.name })}
                  />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium break-words text-blue-700 dark:text-blue-400">{r.name}</p>
                {r.topic && (
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{stripHtml(r.topic)}</p>
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
        ))}
        {rows.length === 0 && !loading && (
          <div className="rounded-md border bg-muted/30 p-8 text-center text-muted-foreground">
            {t('empty')}
          </div>
        )}
      </div>

      {/* Desktop (md+): the full table. */}
      <div className="hidden rounded-md border overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted border-b-2">
              {canShareLessons && <TableHead className="w-10" />}
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
            {rows.map((r) => (
              <TableRow
                key={r.id}
                className="cursor-pointer hover:bg-muted/50 active:bg-muted/70 transition-colors"
                onClick={() => router.push(lessonPath(lang, r.id))}
              >
                {canShareLessons && (
                  <TableCell className="w-10 align-top" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.has(r.id)}
                      onCheckedChange={(c) => toggleSelected(r.id, c === true)}
                      aria-label={t('selectAria', { name: r.name })}
                    />
                  </TableCell>
                )}
                <TableCell className="whitespace-normal break-words align-top">
                  <span className="font-medium text-blue-700 dark:text-blue-400 hover:underline">
                    {r.name}
                  </span>
                </TableCell>
                <TableCell className="whitespace-normal break-words align-top text-muted-foreground">
                  {r.topic ? (
                    <span className="line-clamp-2">{stripHtml(r.topic)}</span>
                  ) : (
                    '—'
                  )}
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
            ))}
            {rows.length === 0 && !loading && (
              <TableRow>
                <TableCell
                  colSpan={COLS.length + 2 + (canShareLessons ? 2 : 0)}
                  className="text-center py-8 text-muted-foreground"
                >
                  {t('empty')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
