'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  AlertTriangle,
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  Eraser,
  ImageOff,
  Loader2,
  Star,
} from 'lucide-react';
import { ImagePreviewDialog } from './image-preview-dialog';
import { BulkSelectBar } from './bulk-select-bar';
import { ComprehensionPill } from './comprehension-pill';
import { StarToggle } from './star-toggle';
import { FilterMultiSelect } from './filter-multi-select';
import {
  COMPREHENSION_LEVELS,
  COMPREHENSION_META,
  type ComprehensionLevel,
} from '@/lib/comprehension';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import type { UserRole } from '@/lib/roles';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { colorForLesson, colorForTag } from '@/lib/colors';
import { cn } from '@/lib/utils';
import { vocabPath, lessonPath } from '@/lib/routes';
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

type SortCol = 'thai' | 'english' | 'lessons' | 'tags';
type SortOrder = 'asc' | 'desc';
type ImageStatusFilter = 'all' | 'has' | 'none' | 'failed';

const PAGE_SIZE_OPTIONS = ['25', '50', '100', 'all'] as const;
type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

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
  comprehension: ComprehensionLevel;
  starred: boolean;
}

interface Props {
  /** When set, restrict results to this lesson. */
  lessonId?: string;
  /** Default rows per page. Use 'all' on the lesson detail page. */
  defaultPageSize?: PageSizeOption;
  /** Search the table contents (substring on target + native). */
  showSearch?: boolean;
  /** Show the inline page-size picker. */
  showPageSize?: boolean;
  /** Enable the bulk-select toolbar + per-row checkboxes (§4). */
  enableBulkSelect?: boolean;
  /** Show the "Edit tags & lessons" bulk action in the selection toolbar. */
  showEditTagsLessons?: boolean;
  /** Called after a bulk edit mutates items, so the host can refresh (count etc.). */
  onMutated?: () => void;
}

interface MeShape {
  id: string;
  targetLanguage: string;
  nativeLanguage: string;
  role: UserRole;
  displayName: string | null;
}

export function VocabTable({
  lessonId,
  defaultPageSize = '100',
  showSearch = true,
  showPageSize = true,
  enableBulkSelect = false,
  showEditTagsLessons = false,
  onMutated,
}: Props) {
  const params = useParams<{ lang?: string }>();
  const lang = params.lang ?? 'th';

  const [me, setMe] = useState<MeShape | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [items, setItems] = useState<VocabItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadedPages, setLoadedPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<VocabItem | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [pageSize, setPageSize] = useState<PageSizeOption>(defaultPageSize);
  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  // Whether the server returned these in the user's manual drag order (Part 3).
  const [manualOrder, setManualOrder] = useState(false);

  // Part 2: the same Filters facets as the main vocab page, applied client-side
  // to this lesson's loaded rows (tag / comprehension / starred / image-status).
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [selectedComprehension, setSelectedComprehension] = useState<Set<string>>(new Set());
  const [starredOnly, setStarredOnly] = useState(false);
  const [imageStatusFilter, setImageStatusFilter] = useState<ImageStatusFilter>('all');
  const [filterMode, setFilterMode] = useState<'and' | 'or'>('and');

  const t = useTranslations('vocab');
  const tc = useTranslations('common');
  const locale = useLocale();
  const targetLabel = displayLanguageName(
    locale,
    normalizeLanguageCode(me?.targetLanguage ?? lang),
    languageName(me?.targetLanguage ?? lang) || 'Target',
  );
  const nativeLabel = displayLanguageName(
    locale,
    localeLanguageSubtag(locale),
    localeEnglishName(me?.nativeLanguage) || 'Native',
  );

  const SORT_COLS: { id: SortCol; label: string }[] = [
    { id: 'thai', label: targetLabel },
    { id: 'english', label: nativeLabel },
    { id: 'lessons', label: 'Lessons' },
    { id: 'tags', label: 'Tags' },
  ];

  const filterKey = useMemo(
    () => [searchTerm, sortCol ?? '', sortOrder, pageSize, lessonId ?? ''].join('|'),
    [searchTerm, sortCol, sortOrder, pageSize, lessonId],
  );

  useEffect(() => {
    fetch(withBase('/api/me'))
      .then((r) => (r.ok ? r.json() : null))
      .then((mr) => setMe(mr ?? null));
  }, []);

  useEffect(() => {
    setItems([]);
    setLoadedPages(1);
    setSelectedIds(new Set());
  }, [filterKey]);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (pageSize === 'all') {
      qs.set('pageSize', 'all');
      qs.set('page', '1');
    } else {
      qs.set('pageSize', String(pageSize));
      qs.set('page', String(loadedPages));
    }
    if (searchTerm) qs.set('search', searchTerm);
    if (lessonId) qs.set('lessonId', lessonId);
    if (sortCol) {
      qs.set('sort', sortCol);
      qs.set('order', sortOrder);
    }
    fetch(withBase(`/api/vocab?${qs.toString()}`))
      .then((r) => r.json())
      .then(
        (d: {
          items: VocabItem[];
          total: number;
          hasMore: boolean;
          manualOrder?: boolean;
        }) => {
          setTotal(d.total);
          setHasMore(d.hasMore);
          setManualOrder(d.manualOrder ?? false);
          if (loadedPages === 1 || pageSize === 'all') {
            setItems(d.items);
          } else {
            setItems((prev) => [...prev, ...d.items]);
          }
        },
      )
      .finally(() => setLoading(false));
  }, [filterKey, loadedPages, pageSize, searchTerm, sortCol, sortOrder, lessonId]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchTerm(searchInput);
  }

  // Activating any sort control clears the manual drag order (Part 3.2).
  function clearVocabOrder() {
    if (!manualOrder) return;
    setManualOrder(false);
    fetch(withBase('/api/vocab/order'), { method: 'DELETE' }).catch(() => {});
  }

  function cycleSort(col: SortCol) {
    clearVocabOrder();
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

  function toggleSelect(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  // Distinct tags among loaded rows — drives the client-side Tags filter.
  const tagOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of items) for (const tg of i.tags) m.set(tg.id, tg.name);
    return [...m.entries()].map(([id, name]) => ({ id, name }));
  }, [items]);

  const activeFilterCount =
    (selectedTags.size > 0 ? 1 : 0) +
    (selectedComprehension.size > 0 ? 1 : 0) +
    (starredOnly ? 1 : 0) +
    (imageStatusFilter !== 'all' ? 1 : 0);

  function clearFilters() {
    setSelectedTags(new Set());
    setSelectedComprehension(new Set());
    setStarredOnly(false);
    setImageStatusFilter('all');
  }

  // Apply the Filters facets client-side. `mode` governs how multiple selected
  // tags combine (All = every / Any = some); the other facets are AND.
  const filteredItems = useMemo(() => {
    return items.filter((i) => {
      if (selectedTags.size > 0) {
        const ids = i.tags.map((tg) => tg.id);
        const ok =
          filterMode === 'or'
            ? ids.some((id) => selectedTags.has(id))
            : [...selectedTags].every((id) => ids.includes(id));
        if (!ok) return false;
      }
      if (selectedComprehension.size > 0 && !selectedComprehension.has(i.comprehension)) {
        return false;
      }
      if (starredOnly && !i.starred) return false;
      if (imageStatusFilter === 'has' && i.imageStatus !== 'completed') return false;
      if (imageStatusFilter === 'none' && i.imageStatus !== 'none') return false;
      if (
        imageStatusFilter === 'failed' &&
        i.imageStatus !== 'failed' &&
        i.imageStatus !== 'refused'
      ) {
        return false;
      }
      return true;
    });
  }, [items, selectedTags, selectedComprehension, starredOnly, imageStatusFilter, filterMode]);

  // Selectable = visible (filtered) items that aren't mid-generation.
  const selectableIds = useMemo(
    () => filteredItems.filter((i) => i.imageStatus !== 'generating').map((i) => i.id),
    [filteredItems],
  );

  // Selected items' tags/lessons feed the bulk-edit "Remove" options.
  const selectedItems = useMemo(
    () =>
      filteredItems
        .filter((i) => selectedIds.has(i.id))
        .map((i) => ({ id: i.id, tags: i.tags, lessons: i.lessons })),
    [filteredItems, selectedIds],
  );

  // Drag-to-reorder (Part 3). Reorder the full underlying list by placing the
  // moved item next to its visible neighbour — preserving the relative order of
  // items hidden by the active filter — then persist the single move.
  async function handleMove({ movedId, beforeId, afterId }: ReorderMove) {
    const prev = items;
    const moved = items.find((i) => i.id === movedId);
    if (!moved) return;
    const without = items.filter((i) => i.id !== movedId);
    let insertAt = without.length;
    if (beforeId) {
      const idx = without.findIndex((i) => i.id === beforeId);
      if (idx >= 0) insertAt = idx + 1;
    } else if (afterId) {
      const idx = without.findIndex((i) => i.id === afterId);
      if (idx >= 0) insertAt = idx;
    }
    const next = [...without.slice(0, insertAt), moved, ...without.slice(insertAt)];
    setItems(next);
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

  return (
    <div className="space-y-3">
      {(showSearch || showPageSize) && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {showSearch && (
            <form onSubmit={submitSearch} className="flex gap-2 flex-1 max-w-md">
              <Input
                placeholder={`Search ${targetLabel} or ${nativeLabel}…`}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
              <Button type="submit" variant="outline" size="sm">
                Search
              </Button>
            </form>
          )}
          {showPageSize && (
            <div className="flex items-center gap-2 text-xs">
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
          )}
        </div>
      )}

      {/* Part 2: the main vocab Filters accordion, collapsed by default, wired to
          this lesson's client-side rows. */}
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
                title={t('themesHeading')}
                options={tagOptions}
                selected={selectedTags}
                onChange={setSelectedTags}
                swatch={(o) => colorForTag(o.name)}
                emptyHint={t('noTags')}
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
                onClick={() => setStarredOnly((v) => !v)}
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
                    name={`vt-mode-${lessonId ?? 'all'}`}
                    checked={filterMode === 'and'}
                    onChange={() => setFilterMode('and')}
                  />
                  {t('filterAll')}
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name={`vt-mode-${lessonId ?? 'all'}`}
                    checked={filterMode === 'or'}
                    onChange={() => setFilterMode('or')}
                  />
                  {t('filterAny')}
                </label>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {enableBulkSelect && me && (
        <BulkSelectBar
          allIds={selectableIds}
          selectedIds={Array.from(selectedIds)}
          onSelectAll={() => setSelectedIds(new Set(selectableIds))}
          onClearSelection={() => setSelectedIds(new Set())}
          onToggleItem={(id) => toggleSelect(id, !selectedIds.has(id))}
          showGenerateImages
          showShareUnshare
          userRole={me.role}
          userId={me.id}
          userDisplayName={me.displayName}
          lang={lang}
          showEditTagsLessons={showEditTagsLessons}
          selectedItems={selectedItems}
          showStarComprehension
          onBulkEdited={() => {
            setSelectedIds(new Set());
            onMutated?.();
          }}
        />
      )}

      <div className="w-full max-w-full border rounded-md overflow-x-auto">
        <ReorderProvider
          ids={filteredItems.map((i) => i.id)}
          onMove={handleMove}
          disabled={sortCol !== null}
        >
        <Table className="w-full">
          <TableHeader>
            <TableRow className="bg-muted border-b-2">
              <TableHead className="w-8" />
              {enableBulkSelect && <TableHead className="w-10" />}
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
              {filteredItems.map((i) => (
                <SortableRow key={i.id} id={i.id}>
                  {({ setNodeRef, style, handleProps }) => (
                    <TableRow ref={setNodeRef} style={style}>
                      <TableCell className="align-top">
                        <DragHandle handleProps={handleProps} />
                      </TableCell>
                      {enableBulkSelect && (
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
                        <VocabThumb item={i} onClick={() => i.imageUrl && setPreviewItem(i)} />
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
                          {i.tags.map((tg) => {
                            const c = colorForTag(tg.name);
                            return (
                              <Badge
                                key={tg.id}
                                variant="outline"
                                className={cn('border-transparent', c.bg, c.text)}
                              >
                                {tg.name}
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
              {filteredItems.length === 0 && !loading && (
                <TableRow>
                  <TableCell
                    colSpan={SORT_COLS.length + (enableBulkSelect ? 6 : 5)}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No vocab items.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
        </Table>
        </ReorderProvider>
      </div>

      {pageSize !== 'all' && hasMore && (
        <div className="flex items-center justify-center text-sm">
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => setLoadedPages((n) => n + 1)}
          >
            {loading ? 'Loading…' : `Load more (${total - items.length} remaining)`}
          </Button>
        </div>
      )}

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
    </div>
  );
}

function VocabThumb({
  item,
  onClick,
}: {
  item: VocabItem;
  onClick?: () => void;
}) {
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
