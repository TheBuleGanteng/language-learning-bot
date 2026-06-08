'use client';

import { Suspense, useEffect, useRef, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import {
  AlertTriangle,
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  Eraser,
  ImageOff,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SpecialInput } from '@/components/special-input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ImagePreviewDialog } from '@/components/vocab/image-preview-dialog';
import { ExtractionFlow } from '@/components/extraction/extraction-flow';
import { buildVocabCsv, downloadCsv, vocabCsvFilename, type VocabCsvField } from '@/lib/csv-export';
import { CsvExportDialog } from '@/components/vocab/csv-export-dialog';
import { NewLessonDialog } from '@/components/new-lesson-dialog';
import { Camera, Plus, Star } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FilterMultiSelect } from '@/components/vocab/filter-multi-select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { BulkSelectBar } from '@/components/vocab/bulk-select-bar';
import { AddToDeckDialog } from '@/components/vocab/add-to-deck-dialog';
import { ComprehensionPill } from '@/components/vocab/comprehension-pill';
import { StarToggle } from '@/components/vocab/star-toggle';
import {
  COMPREHENSION_LEVELS,
  COMPREHENSION_META,
  isComprehensionLevel,
  type ComprehensionLevel,
} from '@/lib/comprehension';
import { colorForLesson, colorForTag } from '@/lib/colors';
import { cn } from '@/lib/utils';
import { vocabPath, lessonPath, decksPath } from '@/lib/routes';
import { languageName, normalizeLanguageCode } from '@/lib/languages';
import { localeEnglishName, displayLanguageName, localeLanguageSubtag } from '@/lib/locales';
import { useTranslations, useLocale } from 'next-intl';
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
import { withBase } from '@/lib/base-path';
import { ReorderProvider, SortableRow, DragHandle, type ReorderMove } from '@/components/dnd/sortable';
import { emitBatchStarted, emitBatchError } from '@/lib/bulk-gen-events';

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
  nativeMachine?: boolean;
  transliteration: string | null;
  lessons: { id: string; name: string }[];
  tags: { id: string; name: string }[];
  imageStorageKey: string | null;
  imageStatus: 'none' | 'generating' | 'completed' | 'refused' | 'failed';
  imageUrl: string | null;
  createdBy: string | null;
  createdByDisplayName: string | null;
  visibility: 'private' | 'shared';
  comprehension: ComprehensionLevel;
  starred: boolean;
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
  /** Whether the server returned these in the user's manual drag order. */
  manualOrder?: boolean;
}
interface MeResponse {
  id: string;
  targetLanguage: string;
  nativeLanguage: string;
  role: 'regular' | 'admin' | 'superuser';
  displayName: string | null;
}

function VocabInner() {
  const router = useRouter();
  const search = useSearchParams();
  const params = useParams<{ lang: string }>();
  const lang = params.lang;
  const t = useTranslations('vocab');
  const tc = useTranslations('common');
  const tdb = useTranslations('deckBuilder');
  const locale = useLocale();

  const [me, setMe] = useState<MeResponse | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [items, setItems] = useState<VocabItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadedPages, setLoadedPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Whether the current list is in the user's manual drag order (Part 3).
  const [manualOrder, setManualOrder] = useState(false);
  const [batch, setBatch] = useState<BatchSnapshot | null>(null);
  const [previewItem, setPreviewItem] = useState<VocabItem | null>(null);
  // Bumping this state forces the fetch effect to re-run even when none of
  // the other deps changed. Used by the bulk-batch polling loop.
  const [refetchCounter, setRefetchCounter] = useState(0);
  const [showExtraction, setShowExtraction] = useState(false);
  // Return-to-staging (item 1): after saving a key in Settings the no-key flow
  // sends the user back here with ?addVocab=photo — reopen the extraction modal.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('addVocab') === 'photo') setShowExtraction(true);
  }, []);

  const [csvDialogOpen, setCsvDialogOpen] = useState(false);

  // Item 9 + item 2: client-side CSV export of the currently-selected vocab
  // rows, limited to the columns the user ticked in the field-picker popup.
  function exportSelectedCsv(fields: VocabCsvField[]) {
    const selected = items.filter((i) => selectedIds.has(i.id));
    if (selected.length === 0) return;
    const csv = buildVocabCsv(
      selected.map((i) => ({
        targetText: i.targetText,
        nativeText: i.nativeText,
        tags: i.tags.map((tg) => tg.name),
        lessons: i.lessons.map((l) => l.name),
        imageUrl: i.imageUrl ?? null,
      })),
      fields,
    );
    downloadCsv(vocabCsvFilename(), csv);
  }
  const [newLessonOpen, setNewLessonOpen] = useState(false);
  const [deckBuilderDialogOpen, setDeckBuilderDialogOpen] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedLessons = useMemo(() => new Set(search.getAll('lesson')), [search]);
  const selectedTags = useMemo(() => new Set(search.getAll('tag')), [search]);
  const selectedCreatedBy = useMemo(() => new Set(search.getAll('createdBy')), [search]);
  const selectedComprehension = useMemo(
    () => new Set(search.getAll('comprehension').filter(isComprehensionLevel)),
    [search],
  );
  const starredOnly = ['1', 'true'].includes(search.get('starred') ?? '');
  const mode: 'and' | 'or' = search.get('mode') === 'or' ? 'or' : 'and';
  // Deck-builder mode (§7a): entered from the Flashcards "Create new deck" button.
  const deckBuilderMode = search.get('mode') === 'deck-builder';
  const imageStatusFilter = parseImageStatusFilter(search.get('imageStatus'));
  // Item 10: how many filter groups are active (count badge in the Filters header).
  const activeFilterCount =
    (selectedLessons.size > 0 ? 1 : 0) +
    (selectedTags.size > 0 ? 1 : 0) +
    (selectedCreatedBy.size > 0 ? 1 : 0) +
    (imageStatusFilter !== 'all' ? 1 : 0) +
    (selectedComprehension.size > 0 ? 1 : 0) +
    (starredOnly ? 1 : 0);
  const searchTerm = search.get('search') ?? '';
  const sortParam = search.get('sort');
  const sortCol: SortCol | null = ((['thai', 'english', 'lessons', 'tags'] as const).find(
    (c) => c === sortParam,
  ) ?? null) as SortCol | null;
  const sortOrder: SortOrder = search.get('order') === 'desc' ? 'desc' : 'asc';
  const pageSize: PageSizeOption = parsePageSizeOpt(search.get('pageSize'));
  const [searchInput, setSearchInput] = useState(searchTerm);

  // Header language names follow the active UI locale (e.g. th → "泰语" in zh-CN).
  const targetLabel = displayLanguageName(
    locale,
    normalizeLanguageCode(me?.targetLanguage ?? lang),
    languageName(me?.targetLanguage ?? lang) || 'Target',
  );
  // The meaning column is rendered in the user's base language (= active locale),
  // so its header is that language's name in the active locale.
  const nativeLabel = displayLanguageName(
    locale,
    localeLanguageSubtag(locale),
    localeEnglishName(me?.nativeLanguage) || 'Native',
  );

  const SORT_COLS: { id: SortCol; label: string }[] = [
    { id: 'thai', label: targetLabel || 'Target' },
    { id: 'english', label: nativeLabel || 'English' },
    { id: 'lessons', label: t('sortLessons') },
    { id: 'tags', label: t('sortTags') },
  ];

  // Distinct creators among the currently-visible vocab — powers the
  // "Created by" filter. Names fall back to the creator id when no display name.
  const creatorOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of items) {
      if (i.createdBy) m.set(i.createdBy, i.createdByDisplayName ?? i.createdBy);
    }
    return [...m.entries()].map(([id, name]) => ({ id, name }));
  }, [items]);

  // Source detection for deck creation (§8a): a single tag (and no lessons)
  // makes a tag-sourced deck; a single lesson (and no tags) a lesson-sourced
  // one; any other combination is a manual deck.
  const activeTag = useMemo(() => {
    if (selectedTags.size === 1 && selectedLessons.size === 0) {
      const id = [...selectedTags][0];
      const t = tags.find((x) => x.id === id);
      return t ? { id: t.id, name: t.name } : null;
    }
    return null;
  }, [selectedTags, selectedLessons, tags]);
  const activeLesson = useMemo(() => {
    if (selectedLessons.size === 1 && selectedTags.size === 0) {
      const id = [...selectedLessons][0];
      const l = lessons.find((x) => x.id === id);
      return l ? { id: l.id, name: l.name } : null;
    }
    return null;
  }, [selectedLessons, selectedTags, lessons]);

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
        Array.from(selectedCreatedBy).sort().join(','),
        Array.from(selectedComprehension).sort().join(','),
        starredOnly ? 'starred' : '',
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
      selectedCreatedBy,
      selectedComprehension,
      starredOnly,
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
      router.replace(`${vocabPath(lang)}${next.size ? `?${next}` : ''}`, { scroll: false });
    }
    // run on first paint only — subsequent edits are user-driven
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      const [lr, tr, mr] = await Promise.all([
        fetch(withBase('/api/lessons')).then((r) => r.json()),
        fetch(withBase('/api/tags')).then((r) => r.json()),
        fetch(withBase('/api/me')).then((r) => r.json()),
      ]);
      setLessons(lr.lessons ?? []);
      setTags(tr.tags ?? []);
      setMe(mr ?? null);
    })();
  }, []);

  useEffect(() => {
    setItems([]);
    setLoadedPages(1);
    // Selection is scoped to the current filtered view; reset it when the
    // filters change (§3c).
    setSelectedIds(new Set());
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
    for (const id of selectedCreatedBy) qs.append('createdBy', id);
    for (const l of selectedComprehension) qs.append('comprehension', l);
    if (starredOnly) qs.set('starred', '1');
    if (imageStatusFilter !== 'all') qs.set('imageStatus', imageStatusFilter);
    qs.set('mode', mode);
    if (sortCol) {
      qs.set('sort', sortCol);
      qs.set('order', sortOrder);
    }
    fetch(withBase(`/api/vocab?${qs.toString()}`))
      .then((r) => r.json())
      .then((d: ListResponse) => {
        setTotal(d.total);
        setHasMore(d.hasMore);
        setManualOrder(d.manualOrder ?? false);
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
    selectedCreatedBy,
    selectedComprehension,
    starredOnly,
    mode,
    sortCol,
    sortOrder,
    imageStatusFilter,
    refetchCounter,
  ]);

  function updateParams(mut: (p: URLSearchParams) => void) {
    const p = new URLSearchParams(search.toString());
    mut(p);
    router.push(`${vocabPath(lang)}?${p.toString()}`, { scroll: false });
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
  function setSelectedCreatedBy(next: Set<string>) {
    updateParams((p) => {
      p.delete('createdBy');
      for (const v of next) p.append('createdBy', v);
    });
  }
  function setSelectedComprehension(next: Set<string>) {
    updateParams((p) => {
      p.delete('comprehension');
      for (const v of next) p.append('comprehension', v);
    });
  }
  function setStarredOnly(on: boolean) {
    updateParams((p) => {
      if (on) p.set('starred', '1');
      else p.delete('starred');
    });
  }
  function setMode(m: 'and' | 'or') {
    updateParams((p) => p.set('mode', m));
  }
  // Reset every grouped filter (Lessons / Themes / Created-by / Image-status /
  // All-Any) to its default and zero the active-filter count (item 3). Preserve
  // everything that isn't a filter — the search term, sort, page size, and the
  // deck-builder mode flag (which is also carried in `mode`) — so clearing
  // filters inside deck builder doesn't kick the user out of it.
  function clearFilters() {
    const p = new URLSearchParams(search.toString());
    p.delete('lesson');
    p.delete('tag');
    p.delete('createdBy');
    p.delete('imageStatus');
    p.delete('comprehension');
    p.delete('starred');
    if (p.get('mode') !== 'deck-builder') p.delete('mode');
    const qs = p.toString();
    router.push(`${vocabPath(lang)}${qs ? `?${qs}` : ''}`, { scroll: false });
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

  // Activating any sort control clears the manual drag order (Part 3.2) — the
  // DELETE is fire-and-forget; a sort-param fetch ignores manual rows anyway.
  function clearVocabOrder() {
    if (!manualOrder) return;
    setManualOrder(false);
    fetch(withBase('/api/vocab/order'), { method: 'DELETE' }).catch(() => {});
  }

  function cycleSort(col: SortCol) {
    clearVocabOrder();
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

  // Drag-to-reorder (Part 3): optimistic local reorder, then persist the single
  // move (server lazy-inits the full ordering on first drag). Revert on failure.
  async function handleVocabMove({ movedId, beforeId, afterId, newIds }: ReorderMove) {
    const prev = items;
    const byId = new Map(items.map((i) => [i.id, i]));
    const reordered = newIds.map((id) => byId.get(id)).filter((i): i is VocabItem => !!i);
    setItems(reordered);
    setManualOrder(true);
    try {
      const res = await fetch(withBase('/api/vocab/order'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movedId, beforeId, afterId }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setItems(prev);
      toast.error('Could not save the new order');
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

  async function doDelete() {
    if (!deleteId) return;
    const res = await fetch(withBase(`/api/vocab/${deleteId}`), { method: 'DELETE' });
    if (res.ok) {
      toast.success(t('deleted'));
      setItems((prev) => prev.filter((i) => i.id !== deleteId));
      setTotal((t) => Math.max(0, t - 1));
    } else {
      toast.error(t('deleteFailed'));
    }
    setDeleteId(null);
  }

  function setImageStatusFilter(next: ImageStatusFilter) {
    updateParams((p) => {
      if (next === 'all') p.delete('imageStatus');
      else p.set('imageStatus', next);
    });
  }

  function toggleSelect(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  // Selectable = currently visible items that aren't mid-generation. Drives
  // both "Select all" and the per-row checkbox disabled state.
  const selectableIds = useMemo(
    () => items.filter((i) => i.imageStatus !== 'generating').map((i) => i.id),
    [items],
  );

  function selectAll() {
    setSelectedIds(new Set(selectableIds));
  }

  function clearSelection() {
    setSelectedIds(new Set());
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
      const res = await fetch(withBase('/api/vocab/generation-status'));
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
      const res = await fetch(withBase('/api/vocab/generation-status'));
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
    const res = await fetch(withBase('/api/vocab/generate-images'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ vocabIds }),
    });
    if (res.status === 402) {
      const data = await res.json().catch(() => ({}));
      // Surface via the global bulk-gen toast (red Error: …) per Part 6.
      emitBatchError(data?.message ?? 'Hard stop reached.');
      // Throw so BulkSelectBar leaves its dialog open and preserves the
      // selection for a retry.
      throw new Error('hard-stop');
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      emitBatchError(data?.error ?? 'Bulk generate failed.');
      throw new Error('generate-failed');
    }
    const data = (await res.json()) as { batchId: string; total: number };
    // Signal the global bulk-gen toast (and BatchWatcher) to poll immediately.
    emitBatchStarted();
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
    // BulkSelectBar closes its dialog and clears the selection on success.
    // Keep generating + completed items visible while the batch runs —
    // otherwise they'd vanish from the No-image view as their status
    // changes. Users can re-apply No-image after the batch finishes.
    setImageStatusFilter('all');
    refreshItems();
    startPolling();
  }

  async function cancelBatch() {
    await fetch(withBase('/api/vocab/generation-status'), { method: 'DELETE' });
    toast.message('Stopping batch — items already in flight will still finish.');
  }

  return (
    <>
      {/* Deck-builder notification (§7a): pinned to the top of the content area
          (just below the global header) for the whole flow — prominent accent
          panel with mode title, instructions, live count, and the in-place
          Add-vocabulary / Create-deck / Exit actions. */}
      {deckBuilderMode && (
        <div className="sticky top-16 z-30 mb-6 rounded-lg border border-amber-500/40 bg-amber-50/90 px-4 py-3 text-amber-900 shadow-sm backdrop-blur-sm dark:border-amber-500/30 dark:bg-amber-950/50 dark:text-amber-50">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <div className="min-w-0 space-y-0.5">
              <p className="text-base font-bold leading-tight">{tdb('title')}</p>
              <p className="text-xs text-amber-800/90 dark:text-amber-100/80">
                {tdb('instructions')}
              </p>
              <p className="text-sm font-semibold">
                {tdb('selected', { count: selectedIds.size })}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                disabled={selectedIds.size === 0}
                onClick={() => setDeckBuilderDialogOpen(true)}
              >
                {tdb('finish')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => router.push(decksPath(lang))}
              >
                {tdb('exit')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[16rem,1fr] gap-6">
        <aside className="space-y-4">
        {/* The create/import actions don't belong in deck-builder mode — adding
            vocab there happens via the sticky notification's in-place dialog. */}
        {!deckBuilderMode && (
          <div className="flex gap-2 flex-wrap">
            <Button asChild size="sm">
              <Link href={vocabPath(lang, '/new')}>{t('addVocab')}</Link>
            </Button>
            {/* CSV import + export are desktop-only workflows (item 9). */}
            <div className="hidden md:flex gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href={vocabPath(lang, '/import')}>{t('importCsv')}</Link>
              </Button>
              <span
                title={selectedIds.size === 0 ? t('exportCsvHint') : undefined}
                className="inline-flex"
              >
                <Button
                  size="sm"
                  variant="outline"
                  disabled={selectedIds.size === 0}
                  onClick={() => setCsvDialogOpen(true)}
                >
                  {t('exportCsv')}
                  {selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
                </Button>
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowExtraction(true)}
              className="gap-1.5"
            >
              <Camera className="h-3.5 w-3.5" />
              {t('addFromPhoto')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setNewLessonOpen(true)}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('newLesson')}
            </Button>
          </div>
        )}

      </aside>

      <section className="space-y-4">
        <form onSubmit={submitSearch} className="flex gap-2">
          <SpecialInput
            placeholder={t('searchPlaceholder')}
            value={searchInput}
            onChange={(val) => setSearchInput(val)}
          />
          <Button type="submit" variant="outline">
            {t('searchBtn')}
          </Button>
        </form>

        {/* Item 10: a single collapsed "Filters" accordion consolidating the
            Lessons / Themes / Created-by dropdowns, image-status pills, and the
            All/Any toggle. Active filters live in the URL, so they persist when
            this is collapsed. The search box above stays outside, always visible. */}
        <Accordion defaultValue={[]} className="border rounded-md overflow-hidden">
          <AccordionItem value="filters">
            <div className="flex items-center bg-muted">
              <AccordionTrigger className="flex-1">
                <span className="inline-flex items-center gap-2 text-sm font-semibold">
                  {t('filtersHeading')}
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary" className="px-1.5">
                      {activeFilterCount}
                    </Badge>
                  )}
                </span>
              </AccordionTrigger>
              {activeFilterCount > 0 && (
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={clearFilters}
                  className="mr-3 shrink-0 gap-1.5"
                >
                  <Eraser className="h-3.5 w-3.5" />
                  {t('clearAll')}
                </Button>
              )}
            </div>
            <AccordionContent>
              <div className="flex flex-wrap items-center gap-2">
                <FilterMultiSelect
                  title={t('lessonsHeading')}
                  options={lessons}
                  selected={selectedLessons}
                  onChange={setSelectedLessons}
                  swatch={(o) => colorForLesson(o.name)}
                  emptyHint={t('noLessons')}
                />
                <FilterMultiSelect
                  title={t('themesHeading')}
                  options={tags}
                  selected={selectedTags}
                  onChange={setSelectedTags}
                  swatch={(o) => colorForTag(o.name)}
                  emptyHint={t('noTags')}
                />
                <FilterMultiSelect
                  title={t('createdByHeading')}
                  options={creatorOptions}
                  selected={selectedCreatedBy}
                  onChange={setSelectedCreatedBy}
                  emptyHint={t('noCreators')}
                />
                <FilterMultiSelect
                  title="Comprehension"
                  options={COMPREHENSION_LEVELS.map((l) => ({
                    id: l,
                    name: COMPREHENSION_META[l].label,
                  }))}
                  selected={selectedComprehension}
                  onChange={setSelectedComprehension}
                  emptyHint="No levels"
                />

                <button
                  type="button"
                  onClick={() => setStarredOnly(!starredOnly)}
                  aria-pressed={starredOnly}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                    starredOnly
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'border-muted-foreground/30 hover:bg-muted',
                  )}
                >
                  <Star className={cn('h-3.5 w-3.5', starredOnly && 'fill-current')} />
                  Starred only
                </button>

                <div className="flex items-center gap-1.5 text-xs flex-wrap">
                  <span className="text-muted-foreground">{t('imageStatus')}</span>
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
                        ? t('imgAll')
                        : opt === 'has'
                          ? t('imgHas')
                          : opt === 'none'
                            ? t('imgNone')
                            : t('imgFailed')}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-3 text-sm border-l pl-3 ml-auto">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="mode"
                      checked={mode === 'and'}
                      onChange={() => setMode('and')}
                    />
                    {t('filterAll')}
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="mode"
                      checked={mode === 'or'}
                      onChange={() => setMode('or')}
                    />
                    {t('filterAny')}
                  </label>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

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
              ? tc('loading')
              : pageSize === 'all'
                ? t('showingAll', { total })
                : t('showingOf', { n: items.length, total })}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{t('showLabel')}</span>
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

        {/* Create-deck dialog reachable from the notification's finish action — the
            same AddToDeckDialog the selection bar uses (forceManual in builder). */}
        {deckBuilderMode && (
          <AddToDeckDialog
            open={deckBuilderDialogOpen}
            onOpenChange={setDeckBuilderDialogOpen}
            lang={lang}
            vocabIds={Array.from(selectedIds)}
            activeTag={activeTag}
            activeLesson={activeLesson}
            forceManual
            onDone={clearSelection}
          />
        )}

        <BulkSelectBar
          allIds={selectableIds}
          selectedIds={Array.from(selectedIds)}
          onSelectAll={selectAll}
          onClearSelection={clearSelection}
          onToggleItem={(id) => toggleSelect(id, !selectedIds.has(id))}
          showGenerateImages
          showShareUnshare
          userRole={me?.role ?? 'regular'}
          userId={me?.id ?? ''}
          userDisplayName={me?.displayName ?? null}
          lang={lang}
          activeTag={activeTag}
          activeLesson={activeLesson}
          deckBuilderMode={deckBuilderMode}
          onGenerateConfirm={confirmBulkGenerate}
          onShareDone={refreshItems}
          showEditTagsLessons
          selectedItems={items
            .filter((i) => selectedIds.has(i.id))
            .map((i) => ({ id: i.id, tags: i.tags, lessons: i.lessons }))}
          showStarComprehension
          onBulkEdited={refreshItems}
        />

        {/* Mobile (< md): stacked card per item — no horizontal scroll. */}
        <div className="space-y-3 md:hidden">
          <ReorderProvider
            ids={items.map((i) => i.id)}
            onMove={handleVocabMove}
            disabled={sortCol !== null}
          >
          {items.map((i) => (
            <SortableRow key={i.id} id={i.id}>
              {({ setNodeRef, style, handleProps }) => (
            <div ref={setNodeRef} style={style} className="rounded-lg border bg-card p-3">
              <div className="flex gap-3">
                <DragHandle handleProps={handleProps} className="mt-1 shrink-0" />
                <Checkbox
                  className="mt-1 shrink-0"
                  checked={selectedIds.has(i.id)}
                  disabled={i.imageStatus === 'generating'}
                  onCheckedChange={(c) => toggleSelect(i.id, c === true)}
                  aria-label={t('selectRow')}
                />
                <div className="shrink-0">
                  <ThumbCell item={i} onClick={() => i.imageUrl && setPreviewItem(i)} />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <Link
                    href={vocabPath(lang, `/${i.id}`)}
                    className="font-medium break-words hover:underline"
                  >
                    {i.targetText}
                  </Link>
                  {i.transliteration && (
                    <span className="block break-words text-xs text-muted-foreground">
                      {i.transliteration}
                    </span>
                  )}
                  <p className="break-words text-sm">
                    {i.nativeText}
                    {i.nativeMachine && (
                      <span
                        className="ml-1 align-middle text-[10px] uppercase tracking-wide text-muted-foreground"
                        title={tc('autoTranslated')}
                      >
                        · {tc('autoTranslated')}
                      </span>
                    )}
                  </p>
                  {(i.lessons.length > 0 || i.tags.length > 0) && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {i.lessons.map((l) => {
                        const c = colorForLesson(l.name);
                        return (
                          <Link key={l.id} href={lessonPath(lang, l.id)} className="inline-block">
                            <Badge variant="outline" className={cn('border-transparent', c.bg, c.text)}>
                              {l.name}
                            </Badge>
                          </Link>
                        );
                      })}
                      {i.tags.map((tag) => {
                        const c = colorForTag(tag.name);
                        return (
                          <Badge
                            key={tag.id}
                            variant="outline"
                            className={cn('border-transparent', c.bg, c.text)}
                          >
                            {tag.name}
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                  {/* Comprehension + star — tappable on the stacked card. */}
                  <div className="flex items-center gap-2 pt-1">
                    <ComprehensionPill
                      itemId={i.id}
                      level={i.comprehension}
                      onChanged={(level) =>
                        setItems((prev) =>
                          prev.map((it) => (it.id === i.id ? { ...it, comprehension: level } : it)),
                        )
                      }
                    />
                    <StarToggle
                      itemId={i.id}
                      starred={i.starred}
                      onChanged={(starred) =>
                        setItems((prev) =>
                          prev.map((it) => (it.id === i.id ? { ...it, starred } : it)),
                        )
                      }
                    />
                  </div>
                </div>
                {/* Actions on the right of the same row (mobile-compact). */}
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="border-blue-300 text-blue-700 hover:bg-blue-50 hover:text-blue-800"
                  >
                    <Link href={vocabPath(lang, `/${i.id}`)}>{tc('edit')}</Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => setDeleteId(i.id)}
                  >
                    {tc('delete')}
                  </Button>
                </div>
              </div>
            </div>
              )}
            </SortableRow>
          ))}
          </ReorderProvider>
          {items.length === 0 && !loading && (
            <div className="rounded-md border bg-muted/30 p-8 text-center text-muted-foreground">
              {t('noMatch')}
            </div>
          )}
        </div>

        {/* Desktop (md+): the full table. */}
        <div className="hidden w-full max-w-full overflow-x-auto rounded-md border md:block">
          <ReorderProvider
            ids={items.map((i) => i.id)}
            onMove={handleVocabMove}
            disabled={sortCol !== null}
          >
          <Table className="w-full">
            <TableHeader>
              <TableRow className="bg-muted border-b-2">
                <TableHead className="w-8" />
                <TableHead className="w-10" />
                <TableHead className="w-10 font-semibold">Star</TableHead>
                <TableHead className="w-14 font-semibold">{t('colImage')}</TableHead>
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
                <TableHead className="w-28 font-semibold">Comprehension</TableHead>
                <TableHead className="w-32 text-right font-semibold">{t('colActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((i) => (
                <SortableRow key={i.id} id={i.id}>
                  {({ setNodeRef, style, handleProps }) => (
                <TableRow ref={setNodeRef} style={style}>
                  <TableCell className="align-top">
                    <DragHandle handleProps={handleProps} />
                  </TableCell>
                  <TableCell className="align-top">
                    <Checkbox
                      checked={selectedIds.has(i.id)}
                      disabled={i.imageStatus === 'generating'}
                      onCheckedChange={(c) => toggleSelect(i.id, c === true)}
                      aria-label={t('selectRow')}
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <StarToggle
                      itemId={i.id}
                      starred={i.starred}
                      onChanged={(starred) =>
                        setItems((prev) =>
                          prev.map((it) => (it.id === i.id ? { ...it, starred } : it)),
                        )
                      }
                    />
                  </TableCell>
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
                  <TableCell className="whitespace-normal break-words align-top">
                    {i.nativeText}
                    {i.nativeMachine && (
                      <span
                        className="ml-1 align-middle text-[10px] uppercase tracking-wide text-muted-foreground"
                        title={tc('autoTranslated')}
                      >
                        · {tc('autoTranslated')}
                      </span>
                    )}
                  </TableCell>
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
                  <TableCell className="align-top">
                    <ComprehensionPill
                      itemId={i.id}
                      level={i.comprehension}
                      onChanged={(level) =>
                        setItems((prev) =>
                          prev.map((it) => (it.id === i.id ? { ...it, comprehension: level } : it)),
                        )
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right align-top">
                    <div className="inline-flex items-center gap-1">
                      <Button
                        asChild
                        size="xs"
                        variant="outline"
                        className="border-blue-300 text-blue-700 hover:bg-blue-50 hover:text-blue-800"
                      >
                        <Link href={vocabPath(lang, `/${i.id}`)}>{tc('edit')}</Link>
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                        onClick={() => setDeleteId(i.id)}
                      >
                        {tc('delete')}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                  )}
                </SortableRow>
              ))}
              {items.length === 0 && !loading && (
                <TableRow>
                  <TableCell
                    colSpan={SORT_COLS.length + 6}
                    className="text-center py-8 text-muted-foreground"
                  >
                    {t('noMatch')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </ReorderProvider>
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
            <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteItemDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete}>{tc('delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ImagePreviewDialog
        open={!!previewItem}
        onOpenChange={(o) => !o && setPreviewItem(null)}
        lang={lang}
        vocabId={previewItem?.id ?? ''}
        imageUrl={previewItem?.imageUrl ?? null}
        targetText={previewItem?.targetText ?? ''}
        nativeText={previewItem?.nativeText ?? ''}
      />

      <ExtractionFlow
        open={showExtraction}
        onOpenChange={setShowExtraction}
        onSaved={refreshItems}
      />

      <NewLessonDialog
        open={newLessonOpen}
        onOpenChange={setNewLessonOpen}
        lang={lang}
      />

      <CsvExportDialog
        open={csvDialogOpen}
        onOpenChange={setCsvDialogOpen}
        count={selectedIds.size}
        onDownload={exportSelectedCsv}
      />
      </div>
    </>
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
