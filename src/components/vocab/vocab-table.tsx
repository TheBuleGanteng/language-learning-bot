'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  AlertTriangle,
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  ImageOff,
  Loader2,
} from 'lucide-react';
import { ImagePreviewDialog } from './image-preview-dialog';
import { BulkSelectBar } from './bulk-select-bar';
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
import { colorForLesson, colorForTag } from '@/lib/colors';
import { cn } from '@/lib/utils';
import { vocabPath, lessonPath } from '@/lib/routes';
import { languageName } from '@/lib/languages';
import { localeEnglishName } from '@/lib/locales';
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

type SortCol = 'thai' | 'english' | 'lessons' | 'tags';
type SortOrder = 'asc' | 'desc';

const PAGE_SIZE_OPTIONS = ['25', '50', '100', 'all'] as const;
type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

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

  const targetLabel = languageName(me?.targetLanguage ?? lang) || 'Target';
  const nativeLabel = localeEnglishName(me?.nativeLanguage) || 'Native';

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
        }) => {
          setTotal(d.total);
          setHasMore(d.hasMore);
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

  async function doDelete() {
    if (!deleteId) return;
    const res = await fetch(withBase(`/api/vocab/${deleteId}`), { method: 'DELETE' });
    if (res.ok) {
      toast.success('Deleted');
      setItems((prev) => prev.filter((i) => i.id !== deleteId));
      setTotal((t) => Math.max(0, t - 1));
    } else {
      toast.error('Delete failed');
    }
    setDeleteId(null);
  }

  // Selectable = visible items that aren't mid-generation.
  const selectableIds = useMemo(
    () => items.filter((i) => i.imageStatus !== 'generating').map((i) => i.id),
    [items],
  );

  function toggleSelect(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
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
        />
      )}

      <div className="w-full max-w-full border rounded-md overflow-x-auto">
        <Table className="w-full">
          <TableHeader>
            <TableRow className="bg-muted border-b-2">
              {enableBulkSelect && <TableHead className="w-10" />}
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
                  <VocabThumb
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
                  colSpan={enableBulkSelect ? 7 : 6}
                  className="text-center py-8 text-muted-foreground"
                >
                  No vocab items.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
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
