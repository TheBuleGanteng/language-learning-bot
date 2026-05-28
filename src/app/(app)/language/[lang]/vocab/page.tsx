'use client';

import { Suspense, useEffect, useRef, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import {
  AlertTriangle,
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  ImageIcon,
  ImageOff,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { BulkImageDialog } from '@/components/vocab/bulk-image-dialog';
import { ImagePreviewDialog } from '@/components/vocab/image-preview-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FilterAccordion } from '@/components/vocab/filter-accordion';
import { colorForLesson, colorForTag } from '@/lib/colors';
import { cn } from '@/lib/utils';
import { vocabPath, lessonPath } from '@/lib/routes';
import { languageName } from '@/lib/languages';
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
import { toast } from 'sonner';

type SortCol = 'thai' | 'english' | 'lessons' | 'tags';
type SortOrder = 'asc' | 'desc';

const PAGE_SIZE_OPTIONS = ['25', '50', '100', 'all'] as const;
type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

function parsePageSizeOpt(raw: string | null): PageSizeOption {
  if (raw === 'all' || raw === '25' || raw === '50') return raw;
  return '100';
}

function parseImageStatusFilter(raw: string | null): ImageStatusFilter {
  if (raw === 'has' || raw === 'none' || raw === 'failed') return raw;
  return 'all';
}

interface Lesson {
  id: string;
  name: string;
  lessonNumber: number | null;
}
interface Tag {
  id: string;
  name: string;
}
interface VocabItem {
  id: string;
  targetText: string;
  nativeText: string;
  transliteration: string | null;
  lessons: { id: string; name: string }[];
  tags: { id: string; name: string }[];
  imageStorageKey: string | null;
  imageStatus: 'none' | 'generating' | 'completed' | 'refused' | 'failed';
  imageUrl: string | null;
}

type ImageStatusFilter = 'all' | 'has' | 'none' | 'failed';

interface BatchSnapshot {
  total: number;
  completed: number;
  failed: number;
  refused: number;
  done: number;
  inFlight: boolean;
  cancelled: boolean;
  hardStopHit: boolean;
}
interface ListResponse {
  items: VocabItem[];
  page: number;
  pageSize: number | 'all';
  total: number;
  hasMore: boolean;
}
interface MeResponse {
  targetLanguage: string;
  nativeLanguage: string;
}

function VocabInner() {
  const router = useRouter();
  const search = useSearchParams();
  const params = useParams<{ lang: string }>();
  const lang = params.lang;

  const [me, setMe] = useState<MeResponse | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [items, setItems] = useState<VocabItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadedPages, setLoadedPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [batch, setBatch] = useState<BatchSnapshot | null>(null);
  const [previewItem, setPreviewItem] = useState<VocabItem | null>(null);
  // Bumping this state forces the fetch effect to re-run even when none of
  // the other deps changed. Used by the bulk-batch polling loop.
  const [refetchCounter, setRefetchCounter] = useState(0);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedLessons = useMemo(() => new Set(search.getAll('lesson')), [search]);
  const selectedTags = useMemo(() => new Set(search.getAll('tag')), [search]);
  const mode: 'and' | 'or' = search.get('mode') === 'or' ? 'or' : 'and';
  const imageStatusFilter = parseImageStatusFilter(search.get('imageStatus'));
  const searchTerm = search.get('search') ?? '';
  const sortParam = search.get('sort');
  const sortCol: SortCol | null = ((['thai', 'english', 'lessons', 'tags'] as const).find(
    (c) => c === sortParam,
  ) ?? null) as SortCol | null;
  const sortOrder: SortOrder = search.get('order') === 'desc' ? 'desc' : 'asc';
  const pageSize: PageSizeOption = parsePageSizeOpt(search.get('pageSize'));
  const [searchInput, setSearchInput] = useState(searchTerm);

  const targetLabel = languageName(me?.targetLanguage ?? lang);
  const nativeLabel = languageName(me?.nativeLanguage ?? 'en');

  const SORT_COLS: { id: SortCol; label: string }[] = [
    { id: 'thai', label: targetLabel || 'Target' },
    { id: 'english', label: nativeLabel || 'English' },
    { id: 'lessons', label: 'Lessons' },
    { id: 'tags', label: 'Tags' },
  ];

  const filterKey = useMemo(
    () =>
      [
        searchTerm,
        mode,
        sortCol ?? '',
        sortOrder,
        pageSize,
        imageStatusFilter,
        Array.from(selectedLessons).sort().join(','),
        Array.from(selectedTags).sort().join(','),
      ].join('|'),
    [
      searchTerm,
      mode,
      sortCol,
      sortOrder,
      pageSize,
      imageStatusFilter,
      selectedLessons,
      selectedTags,
    ],
  );

  useEffect(() => {
    setSearchInput(searchTerm);
  }, [searchTerm]);

  useEffect(() => {
    if (search.get('notice') === 'wrong-lang') {
      toast.error("You're not studying that language yet. Set it up in Settings.");
      const next = new URLSearchParams(search.toString());
      next.delete('notice');
      router.replace(`${vocabPath(lang)}${next.size ? `?${next}` : ''}`);
    }
    // run on first paint only — subsequent edits are user-driven
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      const [lr, tr, mr] = await Promise.all([
        fetch('/api/lessons').then((r) => r.json()),
        fetch('/api/tags').then((r) => r.json()),
        fetch('/api/me').then((r) => r.json()),
      ]);
      setLessons(lr.lessons ?? []);
      setTags(tr.tags ?? []);
      setMe(mr ?? null);
    })();
  }, []);

  useEffect(() => {
    setItems([]);
    setLoadedPages(1);
  }, [filterKey]);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    qs.set('page', '1');
    if (pageSize === 'all') {
      qs.set('pageSize', 'all');
    } else {
      qs.set('pageSize', String(pageSize));
      qs.set('page', String(loadedPages));
    }
    if (searchTerm) qs.set('search', searchTerm);
    for (const id of selectedLessons) qs.append('lesson', id);
    for (const id of selectedTags) qs.append('tag', id);
    if (imageStatusFilter !== 'all') qs.set('imageStatus', imageStatusFilter);
    qs.set('mode', mode);
    if (sortCol) {
      qs.set('sort', sortCol);
      qs.set('order', sortOrder);
    }
    fetch(`/api/vocab?${qs.toString()}`)
      .then((r) => r.json())
      .then((d: ListResponse) => {
        setTotal(d.total);
        setHasMore(d.hasMore);
        if (loadedPages === 1 || pageSize === 'all') {
          setItems(d.items);
        } else {
          setItems((prev) => [...prev, ...d.items]);
        }
      })
      .finally(() => setLoading(false));
  }, [
    filterKey,
    loadedPages,
    pageSize,
    searchTerm,
    selectedLessons,
    selectedTags,
    mode,
    sortCol,
    sortOrder,
    imageStatusFilter,
    refetchCounter,
  ]);

  function updateParams(mut: (p: URLSearchParams) => void) {
    const p = new URLSearchParams(search.toString());
    mut(p);
    router.push(`${vocabPath(lang)}?${p.toString()}`);
  }

  function setSelectedLessons(next: Set<string>) {
    updateParams((p) => {
      p.delete('lesson');
      for (const v of next) p.append('lesson', v);
    });
  }
  function setSelectedTags(next: Set<string>) {
    updateParams((p) => {
      p.delete('tag');
      for (const v of next) p.append('tag', v);
    });
  }
  function setMode(m: 'and' | 'or') {
    updateParams((p) => p.set('mode', m));
  }
  function clearFilters() {
    router.push(vocabPath(lang));
  }
  function setPageSize(ps: PageSizeOption) {
    updateParams((p) => {
      if (ps === '100') p.delete('pageSize');
      else p.set('pageSize', ps);
    });
  }
  function loadMore() {
    setLoadedPages((n) => n + 1);
  }
  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    updateParams((p) => {
      if (searchInput) p.set('search', searchInput);
      else p.delete('search');
    });
  }

  function cycleSort(col: SortCol) {
    updateParams((p) => {
      const cur = p.get('sort');
      const ord = p.get('order') === 'desc' ? 'desc' : 'asc';
      if (cur !== col) {
        p.set('sort', col);
        p.set('order', 'asc');
      } else if (ord === 'asc') {
        p.set('order', 'desc');
      } else {
        p.delete('sort');
        p.delete('order');
      }
    });
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

  async function doDelete() {
    if (!deleteId) return;
    const res = await fetch(`/api/vocab/${deleteId}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Deleted');
      setItems((prev) => prev.filter((i) => i.id !== deleteId));
      setTotal((t) => Math.max(0, t - 1));
    } else {
      toast.error('Delete failed');
    }
    setDeleteId(null);
  }

  function setImageStatusFilter(next: ImageStatusFilter) {
    updateParams((p) => {
      if (next === 'all') p.delete('imageStatus');
      else p.set('imageStatus', next);
    });
  }

  function enterSelectionMode() {
    setSelectionMode(true);
    setSelectedIds(new Set());
    if (imageStatusFilter === 'all') setImageStatusFilter('none');
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  function toggleSelect(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const i of items) {
        if (i.imageStatus !== 'generating') next.add(i.id);
      }
      return next;
    });
  }

  /**
   * Force the fetch effect to re-run. Bumping `refetchCounter` is the
   * canonical "refetch now" signal — earlier versions reset `loadedPages`
   * to 1, but React bails on no-op setState when it was already 1, so the
   * fetch effect's dep array never observed a change and nothing fired.
   */
  function refreshItems() {
    setRefetchCounter((n) => n + 1);
  }

  function startPolling() {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      const res = await fetch('/api/vocab/generation-status');
      if (!res.ok) return;
      const data = (await res.json()) as { batch: BatchSnapshot | null };
      setBatch(data.batch);
      refreshItems();
      if (!data.batch || !data.batch.inFlight) {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }
    }, 5000);
  }

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // On first paint, hydrate any in-flight batch — survives page reload.
  useEffect(() => {
    (async () => {
      const res = await fetch('/api/vocab/generation-status');
      if (!res.ok) return;
      const data = (await res.json()) as { batch: BatchSnapshot | null };
      if (data.batch?.inFlight) {
        setBatch(data.batch);
        startPolling();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function confirmBulkGenerate(vocabIds: string[]) {
    const res = await fetch('/api/vocab/generate-images', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ vocabIds }),
    });
    if (res.status === 402) {
      const data = await res.json().catch(() => ({}));
      toast.error(data?.message ?? 'Hard stop reached.');
      return;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data?.error ?? 'Bulk generate failed.');
      return;
    }
    const data = (await res.json()) as { batchId: string; total: number };
    toast.success(`Started generating ${data.total} image${data.total === 1 ? '' : 's'}.`);
    setBatch({
      total: data.total,
      completed: 0,
      failed: 0,
      refused: 0,
      done: 0,
      inFlight: true,
      cancelled: false,
      hardStopHit: false,
    });
    setShowBulkDialog(false);
    exitSelectionMode();
    // Keep generating + completed items visible while the batch runs —
    // otherwise they'd vanish from the No-image view as their status
    // changes. Users can re-apply No-image after the batch finishes.
    setImageStatusFilter('all');
    refreshItems();
    startPolling();
  }

  async function cancelBatch() {
    await fetch('/api/vocab/generation-status', { method: 'DELETE' });
    toast.message('Stopping batch — items already in flight will still finish.');
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[16rem,1fr] gap-6">
      <aside className="space-y-4">
        <div className="flex gap-2 flex-wrap">
          <Button asChild size="sm">
            <Link href={vocabPath(lang, '/new')}>Add vocab</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={vocabPath(lang, '/import')}>Import CSV</Link>
          </Button>
          {!selectionMode && (
            <Button
              size="sm"
              variant="outline"
              onClick={enterSelectionMode}
              className="gap-1.5"
            >
              <ImageIcon className="h-3.5 w-3.5" />
              Generate Images
            </Button>
          )}
        </div>

        <div className="space-y-2 border rounded-md p-3">
          <div className="flex items-center gap-3 text-sm">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name="mode"
                checked={mode === 'and'}
                onChange={() => setMode('and')}
              />
              ALL (AND)
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name="mode"
                checked={mode === 'or'}
                onChange={() => setMode('or')}
              />
              ANY (OR)
            </label>
          </div>
          <Button size="xs" variant="outline" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>

        <FilterAccordion
          title="Lessons"
          slug="lessons"
          options={lessons}
          selected={selectedLessons}
          onChange={setSelectedLessons}
          swatch={(o) => colorForLesson(o.name)}
          emptyHint="No lessons yet."
        />

        <FilterAccordion
          title="Themes"
          slug="themes"
          options={tags}
          selected={selectedTags}
          onChange={setSelectedTags}
          swatch={(o) => colorForTag(o.name)}
          emptyHint="No tags yet."
        />
      </aside>

      <section className="space-y-4">
        <form onSubmit={submitSearch} className="flex gap-2">
          <Input
            placeholder={`Search ${targetLabel || 'target'} or ${nativeLabel || 'native'} text…`}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>

        <div className="flex items-center gap-2 text-xs flex-wrap">
          <span className="text-muted-foreground">Image status:</span>
          {(['all', 'has', 'none', 'failed'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setImageStatusFilter(opt)}
              className={cn(
                'rounded-full px-2.5 py-1 border transition-colors',
                imageStatusFilter === opt
                  ? 'bg-foreground text-background border-foreground'
                  : 'border-muted-foreground/30 hover:bg-muted',
              )}
            >
              {opt === 'all'
                ? 'All'
                : opt === 'has'
                  ? 'Has image'
                  : opt === 'none'
                    ? 'No image'
                    : 'Failed/refused'}
            </button>
          ))}
        </div>

        {selectionMode && (
          <div className="sticky top-0 z-10 flex items-center gap-2 flex-wrap rounded-md border bg-background p-2 shadow-sm">
            <span className="text-sm font-medium">
              {selectedIds.size.toLocaleString()} selected
            </span>
            <Button size="xs" variant="outline" onClick={selectAllVisible}>
              Select all visible
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() => setSelectedIds(new Set())}
              disabled={selectedIds.size === 0}
            >
              Clear selection
            </Button>
            <Button
              size="xs"
              onClick={() => setShowBulkDialog(true)}
              disabled={selectedIds.size === 0}
            >
              Generate Images for {selectedIds.size.toLocaleString()}
            </Button>
            <Button size="xs" variant="ghost" onClick={exitSelectionMode} className="ml-auto">
              Cancel
            </Button>
          </div>
        )}

        {batch && batch.inFlight && (
          <div className="flex items-center gap-3 rounded-md border bg-muted/40 p-3 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span>
              Generating images: {batch.completed} of {batch.total} complete
              {batch.failed > 0 && ` · ${batch.failed} failed`}
              {batch.refused > 0 && ` · ${batch.refused} refused`}
            </span>
            <Button size="xs" variant="outline" onClick={cancelBatch} className="ml-auto">
              Stop
            </Button>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 flex-wrap text-xs">
          <p className="text-muted-foreground">
            {loading && items.length === 0
              ? 'Loading…'
              : pageSize === 'all'
                ? `Showing all ${total} items`
                : `Showing ${items.length} of ${total} items`}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Show:</span>
            <Select
              value={pageSize}
              onValueChange={(v) => v && setPageSize(v as PageSizeOption)}
            >
              <SelectTrigger className="h-8 w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt === 'all' ? 'All' : opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="w-full max-w-full border rounded-md overflow-x-auto">
          <Table className="w-full">
            <TableHeader>
              <TableRow className="bg-muted border-b-2">
                {selectionMode && <TableHead className="w-10" />}
                <TableHead className="w-14 font-semibold">Image</TableHead>
                {SORT_COLS.map((c) => (
                  <TableHead
                    key={c.id}
                    onClick={() => cycleSort(c.id)}
                    className="font-semibold cursor-pointer select-none hover:bg-muted-foreground/10"
                  >
                    {c.label}
                    {sortIcon(c.id)}
                  </TableHead>
                ))}
                <TableHead className="w-32 text-right font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((i) => (
                <TableRow key={i.id}>
                  {selectionMode && (
                    <TableCell className="align-top">
                      <Checkbox
                        checked={selectedIds.has(i.id)}
                        disabled={i.imageStatus === 'generating'}
                        onCheckedChange={(c) => toggleSelect(i.id, c === true)}
                        aria-label="Select row"
                      />
                    </TableCell>
                  )}
                  <TableCell className="align-top">
                    <ThumbCell
                      item={i}
                      onClick={() => i.imageUrl && setPreviewItem(i)}
                    />
                  </TableCell>
                  <TableCell className="font-medium whitespace-normal break-words align-top">
                    <Link href={vocabPath(lang, `/${i.id}`)} className="hover:underline">
                      {i.targetText}
                    </Link>
                    {i.transliteration && (
                      <span className="block text-xs text-muted-foreground break-words">
                        {i.transliteration}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-normal break-words align-top">{i.nativeText}</TableCell>
                  <TableCell className="align-top">
                    <div className="flex flex-wrap gap-1">
                      {i.lessons.map((l) => {
                        const c = colorForLesson(l.name);
                        return (
                          <Link
                            key={l.id}
                            href={lessonPath(lang, l.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-block"
                          >
                            <Badge
                              variant="outline"
                              className={cn(
                                'border-transparent cursor-pointer hover:underline transition-opacity hover:opacity-80',
                                c.bg,
                                c.text,
                              )}
                            >
                              {l.name}
                            </Badge>
                          </Link>
                        );
                      })}
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex flex-wrap gap-1">
                      {i.tags.map((t) => {
                        const c = colorForTag(t.name);
                        return (
                          <Badge
                            key={t.id}
                            variant="outline"
                            className={cn('border-transparent', c.bg, c.text)}
                          >
                            {t.name}
                          </Badge>
                        );
                      })}
                    </div>
                  </TableCell>
                  <TableCell className="text-right align-top">
                    <div className="inline-flex items-center gap-1">
                      <Button
                        asChild
                        size="xs"
                        variant="outline"
                        className="border-blue-300 text-blue-700 hover:bg-blue-50 hover:text-blue-800"
                      >
                        <Link href={vocabPath(lang, `/${i.id}`)}>Edit</Link>
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                        onClick={() => setDeleteId(i.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && !loading && (
                <TableRow>
                  <TableCell
                    colSpan={SORT_COLS.length + 2 + (selectionMode ? 1 : 0)}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No vocab items match your filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {pageSize !== 'all' && (
          <div className="flex items-center justify-center text-sm">
            {hasMore ? (
              <Button variant="outline" size="sm" disabled={loading} onClick={loadMore}>
                {loading ? 'Loading…' : `Load more (${total - items.length} remaining)`}
              </Button>
            ) : items.length > 0 ? (
              <span className="text-muted-foreground">All {total} items loaded</span>
            ) : null}
          </div>
        )}

      </section>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this vocab item?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The item, its lesson assignment, and its tag
              assignments will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BulkImageDialog
        open={showBulkDialog}
        onOpenChange={setShowBulkDialog}
        selectedCount={selectedIds.size}
        vocabIds={Array.from(selectedIds)}
        onConfirm={confirmBulkGenerate}
      />

      <ImagePreviewDialog
        open={!!previewItem}
        onOpenChange={(o) => !o && setPreviewItem(null)}
        lang={lang}
        vocabId={previewItem?.id ?? ''}
        imageUrl={previewItem?.imageUrl ?? null}
        targetText={previewItem?.targetText ?? ''}
        nativeText={previewItem?.nativeText ?? ''}
      />
    </div>
  );
}

interface ThumbCellProps {
  item: VocabItem;
  onClick?: () => void;
}

function ThumbCell({ item, onClick }: ThumbCellProps) {
  if (item.imageStatus === 'generating') {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  }
  if (item.imageStatus === 'refused' || item.imageStatus === 'failed') {
    return (
      <AlertTriangle
        className="h-4 w-4 text-amber-600/60"
        aria-label="Generation failed/refused"
      />
    );
  }
  if (item.imageUrl) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
        className="cursor-pointer"
        aria-label="View image"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.imageUrl}
          alt=""
          loading="lazy"
          className="w-10 h-10 rounded-md object-cover border hover:ring-2 hover:ring-primary/50 transition-shadow"
        />
      </button>
    );
  }
  return <ImageOff className="h-4 w-4 text-muted-foreground/40" />;
}

export default function VocabPage() {
  return (
    <Suspense fallback={null}>
      <VocabInner />
    </Suspense>
  );
}
