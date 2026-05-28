'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  ChevronUp,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { NewLessonButton } from './new-lesson-dialog';
import { lessonPath } from '@/lib/routes';
import { stripHtml } from '@/lib/strip-html';

interface LessonRow {
  id: string;
  name: string;
  lessonNumber: number | null;
  topic: string | null;
  date: string | null;
  vocabCount: number;
}

type SortCol = 'name' | 'topic' | 'date' | 'vocab_count';
type SortOrder = 'asc' | 'desc';

const COLS: { id: SortCol; label: string; className?: string }[] = [
  { id: 'name', label: 'Name' },
  { id: 'topic', label: 'Topic' },
  { id: 'date', label: 'Date' },
  { id: 'vocab_count', label: 'Vocab', className: 'text-right' },
];

function formatDate(d: string | null): string {
  if (!d) return '—';
  try {
    return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
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
  const [rows, setRows] = useState<LessonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (sortCol) {
      qs.set('sort', sortCol);
      qs.set('order', sortOrder);
    }
    fetch(`/api/lessons?${qs.toString()}`)
      .then((r) => r.json())
      .then((d: { lessons: LessonRow[] }) => setRows(d.lessons ?? []))
      .finally(() => setLoading(false));
  }, [sortCol, sortOrder]);

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
        <h1 className="text-2xl font-bold">Lessons</h1>
        <NewLessonButton />
      </header>

      <div className="border rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted border-b-2">
              {COLS.map((c) => (
                <TableHead
                  key={c.id}
                  onClick={() => cycleSort(c.id)}
                  className={`font-semibold cursor-pointer select-none hover:bg-muted-foreground/10 ${c.className ?? ''}`}
                >
                  {c.label}
                  {sortIcon(c.id)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow
                key={r.id}
                className="cursor-pointer hover:bg-muted/50 active:bg-muted/70 transition-colors"
                onClick={() => router.push(lessonPath(lang, r.id))}
              >
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
                <TableCell className="align-top">{formatDate(r.date)}</TableCell>
                <TableCell className="align-top text-right tabular-nums">
                  {r.vocabCount}
                </TableCell>
                <TableCell className="w-8 align-top">
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && !loading && (
              <TableRow>
                <TableCell
                  colSpan={COLS.length + 1}
                  className="text-center py-8 text-muted-foreground"
                >
                  No lessons yet. Create your first lesson.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
