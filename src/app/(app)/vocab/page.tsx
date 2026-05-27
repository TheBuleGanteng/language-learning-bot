'use client';

import { Suspense, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { FilterAccordion } from '@/components/vocab/filter-accordion';
import { colorForLesson, colorForTag } from '@/lib/colors';
import { cn } from '@/lib/utils';
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
}
interface ListResponse {
  items: VocabItem[];
  page: number;
  pageSize: number;
  total: number;
}

function VocabInner() {
  const router = useRouter();
  const search = useSearchParams();

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const selectedLessons = useMemo(() => new Set(search.getAll('lesson')), [search]);
  const selectedTags = useMemo(() => new Set(search.getAll('tag')), [search]);
  const mode: 'and' | 'or' = search.get('mode') === 'or' ? 'or' : 'and';
  const page = Math.max(1, parseInt(search.get('page') ?? '1', 10) || 1);
  const searchTerm = search.get('search') ?? '';
  const [searchInput, setSearchInput] = useState(searchTerm);

  useEffect(() => {
    setSearchInput(searchTerm);
  }, [searchTerm]);

  useEffect(() => {
    (async () => {
      const [lr, tr] = await Promise.all([
        fetch('/api/lessons').then((r) => r.json()),
        fetch('/api/tags').then((r) => r.json()),
      ]);
      setLessons(lr.lessons ?? []);
      setTags(tr.tags ?? []);
    })();
  }, []);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    qs.set('page', String(page));
    if (searchTerm) qs.set('search', searchTerm);
    for (const id of selectedLessons) qs.append('lesson', id);
    for (const id of selectedTags) qs.append('tag', id);
    qs.set('mode', mode);
    fetch(`/api/vocab?${qs.toString()}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [page, searchTerm, selectedLessons, selectedTags, mode]);

  function updateParams(mut: (p: URLSearchParams) => void) {
    const p = new URLSearchParams(search.toString());
    mut(p);
    // Always reset to page 1 when filters change (except for an explicit page change)
    router.push(`/vocab?${p.toString()}`);
  }

  function setSelectedLessons(next: Set<string>) {
    updateParams((p) => {
      p.delete('lesson');
      for (const v of next) p.append('lesson', v);
      p.delete('page');
    });
  }
  function setSelectedTags(next: Set<string>) {
    updateParams((p) => {
      p.delete('tag');
      for (const v of next) p.append('tag', v);
      p.delete('page');
    });
  }
  function setMode(m: 'and' | 'or') {
    updateParams((p) => {
      p.set('mode', m);
      p.delete('page');
    });
  }
  function clearFilters() {
    router.push('/vocab');
  }
  function gotoPage(n: number) {
    updateParams((p) => p.set('page', String(n)));
  }
  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    updateParams((p) => {
      if (searchInput) p.set('search', searchInput);
      else p.delete('search');
      p.delete('page');
    });
  }

  async function doDelete() {
    if (!deleteId) return;
    const res = await fetch(`/api/vocab/${deleteId}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Deleted');
      setData((d) => (d ? { ...d, items: d.items.filter((i) => i.id !== deleteId) } : d));
    } else {
      toast.error('Delete failed');
    }
    setDeleteId(null);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[16rem,1fr] gap-6">
      <aside className="space-y-4">
        <div className="flex gap-2">
          <Button asChild size="sm">
            <Link href="/vocab/new">Add vocab</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/vocab/import">Import CSV</Link>
          </Button>
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
            placeholder="Search target or English text…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>

        <p className="text-xs text-muted-foreground">
          {loading
            ? 'Loading…'
            : data
              ? `Showing ${data.items.length} of ${data.total} items`
              : ''}
        </p>

        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Target</TableHead>
                <TableHead>English</TableHead>
                <TableHead>Lessons</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead className="w-32 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">
                    <Link href={`/vocab/${i.id}`} className="hover:underline">
                      {i.targetText}
                    </Link>
                    {i.transliteration && (
                      <span className="block text-xs text-muted-foreground">
                        {i.transliteration}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{i.nativeText}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {i.lessons.map((l) => {
                        const c = colorForLesson(l.name);
                        return (
                          <Badge
                            key={l.id}
                            variant="outline"
                            className={cn('border-transparent', c.bg, c.text)}
                          >
                            {l.name}
                          </Badge>
                        );
                      })}
                    </div>
                  </TableCell>
                  <TableCell>
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
                  <TableCell className="text-right space-x-2">
                    <Button asChild size="xs" variant="ghost">
                      <Link href={`/vocab/${i.id}`}>Edit</Link>
                    </Button>
                    <Button
                      size="xs"
                      variant="destructive"
                      onClick={() => setDeleteId(i.id)}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {data && data.items.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No vocab items match your filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {data && totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => gotoPage(page - 1)}
            >
              ← Previous
            </Button>
            <span className="text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => gotoPage(page + 1)}
            >
              Next →
            </Button>
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
    </div>
  );
}

export default function VocabPage() {
  return (
    <Suspense fallback={null}>
      <VocabInner />
    </Suspense>
  );
}
