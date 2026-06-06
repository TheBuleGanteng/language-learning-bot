'use client';

import { useEffect, useState, type KeyboardEvent } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SpecialInput } from '@/components/special-input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { colorForLesson, colorForTag } from '@/lib/colors';
import { cn } from '@/lib/utils';
import type { ExtractedRow } from '@/lib/extraction';
import { NewLessonDialog } from '@/components/new-lesson-dialog';
import { MultiSelectChips, type NameId } from '@/components/multi-select-chips';
import { InfoHint } from '@/components/info-hint';
import { toast } from 'sonner';
import { withBase } from '@/lib/base-path';

interface ReviewRow {
  id: string;
  targetText: string;
  nativeText: string;
  confidence: 'high' | 'medium' | 'low';
  selected: boolean;
  /** True once the user has edited target or native text. */
  edited: boolean;
  tagIds: string[];
  lessonIds: string[];
}

interface Props {
  /** Extracted rows from /api/vocab/extract-from-photos. */
  initial: ExtractedRow[];
  /** When set (lesson-page entry), every row pre-populates with this lesson. */
  defaultLessonId?: string;
  /** Called with a summary on successful save. */
  onSaved: (summary: { inserted: number; mergedExisting: number }) => void;
  /** Cancel the review and return to wherever we came from. */
  onCancel: () => void;
}

export function ExtractedVocabReview({
  initial,
  defaultLessonId,
  onSaved,
  onCancel,
}: Props) {
  const t = useTranslations('extraction');
  const [rows, setRows] = useState<ReviewRow[]>(() =>
    initial.map((r) => ({
      id: crypto.randomUUID(),
      targetText: r.targetText,
      nativeText: r.nativeText,
      confidence: r.confidence,
      selected: true,
      edited: false,
      tagIds: [],
      lessonIds: defaultLessonId ? [defaultLessonId] : [],
    })),
  );
  const [allTags, setAllTags] = useState<NameId[]>([]);
  const [allLessons, setAllLessons] = useState<NameId[]>([]);
  const [bulkTagIds, setBulkTagIds] = useState<string[]>([]);
  const [bulkLessonIds, setBulkLessonIds] = useState<string[]>([]);
  const [editing, setEditing] = useState<{ rowId: string; col: 'target' | 'native' } | null>(
    null,
  );
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [newLessonOpen, setNewLessonOpen] = useState(false);
  const params = useParams<{ lang: string }>();
  const lang = params.lang;

  useEffect(() => {
    Promise.all([
      fetch(withBase('/api/tags')).then((r) => r.json()),
      fetch(withBase('/api/lessons')).then((r) => r.json()),
    ]).then(([t, l]) => {
      setAllTags((t.tags ?? []) as NameId[]);
      setAllLessons((l.lessons ?? []) as NameId[]);
    });
  }, []);

  const selectedCount = rows.filter((r) => r.selected).length;

  function updateRow(id: string, patch: Partial<ReviewRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function selectAll() {
    setRows((prev) => prev.map((r) => ({ ...r, selected: true })));
  }
  function unselectAll() {
    setRows((prev) => prev.map((r) => ({ ...r, selected: false })));
  }
  function unselectFrom(id: string) {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.id === id);
      if (idx < 0) return prev;
      return prev.map((r, i) => (i >= idx ? { ...r, selected: false } : r));
    });
  }

  function applyBulk() {
    if (selectedCount === 0) {
      toast.error('Select rows first');
      return;
    }
    if (bulkTagIds.length === 0 && bulkLessonIds.length === 0) {
      toast.error('Pick a tag or lesson to apply');
      return;
    }
    setRows((prev) =>
      prev.map((r) =>
        r.selected
          ? {
              ...r,
              tagIds: unionStr(r.tagIds, bulkTagIds),
              lessonIds: unionStr(r.lessonIds, bulkLessonIds),
            }
          : r,
      ),
    );
    setBulkTagIds([]);
    setBulkLessonIds([]);
    toast.success(`Applied to ${selectedCount} row${selectedCount === 1 ? '' : 's'}`);
  }

  function addBlankRow() {
    setRows((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        targetText: '',
        nativeText: '',
        confidence: 'high',
        selected: true,
        edited: true,
        tagIds: [],
        lessonIds: defaultLessonId ? [defaultLessonId] : [],
      },
    ]);
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function startEdit(rowId: string, col: 'target' | 'native') {
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;
    setEditing({ rowId, col });
    setDraft(col === 'target' ? row.targetText : row.nativeText);
  }

  function commitEdit() {
    if (!editing) return;
    const trimmed = draft.trim();
    updateRow(editing.rowId, {
      [editing.col === 'target' ? 'targetText' : 'nativeText']: trimmed,
      edited: true,
    });
    setEditing(null);
    setDraft('');
  }

  function cancelEdit() {
    setEditing(null);
    setDraft('');
  }

  async function save() {
    if (saving) return;
    const payload = rows
      .filter((r) => r.selected && r.targetText.trim() && r.nativeText.trim())
      .map((r) => ({
        targetText: r.targetText.trim(),
        nativeText: r.nativeText.trim(),
        tagIds: r.tagIds,
        lessonIds: r.lessonIds,
      }));
    if (payload.length === 0) {
      toast.error('Nothing to save — select rows with non-empty text');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(withBase('/api/vocab/save-extracted'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: payload }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d?.error ?? 'Save failed');
        return;
      }
      const data = (await res.json()) as {
        inserted: number;
        mergedExisting: number;
        errors: string[];
      };
      if (data.errors.length > 0) {
        toast.message(`${data.errors.length} error${data.errors.length === 1 ? '' : 's'}`);
      }
      onSaved({ inserted: data.inserted, mergedExisting: data.mergedExisting });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm flex-wrap">
        <span className="font-medium">
          {t('selectedOf', { count: selectedCount, total: rows.length })}
        </span>
        <Button size="xs" variant="outline" onClick={selectAll}>
          {t('selectAll')}
        </Button>
        <Button size="xs" variant="outline" onClick={unselectAll}>
          {t('unselectAll')}
        </Button>
      </div>

      <div className="space-y-2 border rounded-md p-3 bg-muted/20">
        <div className="text-xs font-medium text-muted-foreground">
          Apply to selected
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Tags</Label>
            <MultiSelectChips
              options={allTags}
              selectedIds={bulkTagIds}
              onChange={setBulkTagIds}
              swatch={colorForTag}
              placeholder="No tags"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Lessons</Label>
            <MultiSelectChips
              options={allLessons}
              selectedIds={bulkLessonIds}
              onChange={setBulkLessonIds}
              swatch={colorForLesson}
              placeholder="No lessons"
              onCreateNew={() => setNewLessonOpen(true)}
              createNewLabel="+ Create new lesson"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={applyBulk}>
            Apply
          </Button>
        </div>
      </div>

      {/* Mobile (< md): one stacked card per extracted item — Tags/Lessons go
          full-width and tappable, no horizontal scroll (item 4). Shares the same
          row state + edit/confidence/pills helpers as the desktop table below. */}
      <div className="space-y-3 md:hidden">
        {rows.map((r) => (
          <div
            key={r.id}
            className={cn(
              'rounded-lg border bg-card p-3 space-y-3',
              !r.selected && 'opacity-60',
            )}
          >
            <div className="flex items-start gap-2">
              <Checkbox
                className="mt-1 shrink-0"
                checked={r.selected}
                onCheckedChange={(c) => updateRow(r.id, { selected: c === true })}
                aria-label="Select row"
              />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Thai
                  </div>
                  <EditableCell
                    value={r.targetText}
                    edited={r.edited}
                    editing={editing?.rowId === r.id && editing.col === 'target'}
                    draft={draft}
                    onStart={() => startEdit(r.id, 'target')}
                    onChange={setDraft}
                    onCommit={commitEdit}
                    onCancel={cancelEdit}
                    special
                  />
                </div>
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    English
                  </div>
                  <EditableCell
                    value={r.nativeText}
                    edited={r.edited}
                    editing={editing?.rowId === r.id && editing.col === 'native'}
                    draft={draft}
                    onStart={() => startEdit(r.id, 'native')}
                    onChange={setDraft}
                    onCommit={commitEdit}
                    onCancel={cancelEdit}
                  />
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <ConfidenceBadge conf={r.confidence} />
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="text-red-600 hover:bg-red-50"
                  onClick={() => removeRow(r.id)}
                  aria-label="Remove row"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-xs">Tags</Label>
                <RowPills
                  options={allTags}
                  selectedIds={r.tagIds}
                  onChange={(ids) => updateRow(r.id, { tagIds: ids })}
                  swatch={colorForTag}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Lessons</Label>
                <RowPills
                  options={allLessons}
                  selectedIds={r.lessonIds}
                  onChange={(ids) => updateRow(r.id, { lessonIds: ids })}
                  swatch={colorForLesson}
                />
              </div>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="rounded-md border bg-muted/30 p-8 text-center text-muted-foreground">
            No vocabulary extracted.
          </div>
        )}
      </div>

      {/* Desktop (md+): the full table. */}
      <div className="hidden md:block border rounded-md">
        {/* table-fixed + wrapping so the Tags/Lessons pickers fit the available
            width and wrap instead of forcing horizontal scroll (item 3). */}
        <Table className="w-full table-fixed">
          <TableHeader>
            <TableRow className="bg-muted border-b-2">
              <TableHead className="w-10" />
              <TableHead className="font-semibold">Thai</TableHead>
              <TableHead className="font-semibold">English</TableHead>
              <TableHead className="w-28 font-semibold">
                <span className="inline-flex items-center gap-1">
                  Confidence
                  <InfoHint text="How confident the AI is that it read and translated this item correctly. Review low-confidence items before saving." />
                </span>
              </TableHead>
              <TableHead className="font-semibold">Tags</TableHead>
              <TableHead className="font-semibold">Lessons</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} className={cn(!r.selected && 'opacity-50')}>
                <TableCell className="align-top">
                  <Checkbox
                    checked={r.selected}
                    onCheckedChange={(c) => updateRow(r.id, { selected: c === true })}
                    aria-label="Select row"
                  />
                </TableCell>
                <TableCell className="align-top whitespace-normal break-words">
                  <EditableCell
                    value={r.targetText}
                    edited={r.edited}
                    editing={editing?.rowId === r.id && editing.col === 'target'}
                    draft={draft}
                    onStart={() => startEdit(r.id, 'target')}
                    onChange={setDraft}
                    onCommit={commitEdit}
                    onCancel={cancelEdit}
                    special
                  />
                </TableCell>
                <TableCell className="align-top whitespace-normal break-words">
                  <EditableCell
                    value={r.nativeText}
                    edited={r.edited}
                    editing={editing?.rowId === r.id && editing.col === 'native'}
                    draft={draft}
                    onStart={() => startEdit(r.id, 'native')}
                    onChange={setDraft}
                    onCommit={commitEdit}
                    onCancel={cancelEdit}
                  />
                </TableCell>
                <TableCell className="align-top whitespace-normal">
                  <ConfidenceBadge conf={r.confidence} />
                </TableCell>
                <TableCell className="align-top whitespace-normal">
                  <RowPills
                    options={allTags}
                    selectedIds={r.tagIds}
                    onChange={(ids) => updateRow(r.id, { tagIds: ids })}
                    swatch={colorForTag}
                  />
                </TableCell>
                <TableCell className="align-top whitespace-normal">
                  <RowPills
                    options={allLessons}
                    selectedIds={r.lessonIds}
                    onChange={(ids) => updateRow(r.id, { lessonIds: ids })}
                    swatch={colorForLesson}
                  />
                </TableCell>
                <TableCell className="align-top text-right">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="text-red-600 hover:bg-red-50"
                    onClick={() => removeRow(r.id)}
                    aria-label="Remove row"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No vocabulary extracted.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" variant="outline" onClick={addBlankRow}>
          <Plus className="mr-1 h-4 w-4" />
          Add row manually
        </Button>
        <div className="flex flex-wrap gap-2">
          {rows.some((r) => !r.selected) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const firstUnsel = rows.find((r) => !r.selected);
                if (firstUnsel) unselectFrom(firstUnsel.id);
              }}
              title="Unselect from the first unselected row to the bottom"
            >
              Unselect from here down
            </Button>
          )}
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || selectedCount === 0}>
            {saving ? 'Saving…' : `Save ${selectedCount} items`}
          </Button>
        </div>
      </div>

      <NewLessonDialog
        open={newLessonOpen}
        onOpenChange={setNewLessonOpen}
        lang={lang}
        mode="callback"
        onCreated={(lesson) => {
          // Add to the picker's local option list and pre-select it. The picker
          // stays open so the user can also pick existing lessons.
          setAllLessons((prev) =>
            prev.some((l) => l.id === lesson.id) ? prev : [...prev, lesson],
          );
          setBulkLessonIds((prev) =>
            prev.includes(lesson.id) ? prev : [...prev, lesson.id],
          );
        }}
      />
    </div>
  );
}

function unionStr(a: string[], b: string[]): string[] {
  return Array.from(new Set([...a, ...b]));
}

interface ConfidenceBadgeProps {
  conf: 'high' | 'medium' | 'low';
}
// One consistent labeled pill per row (item 2). The extractor emits a
// categorical confidence ('high' | 'medium' | 'low'), so the mapping is direct:
// high → green High, medium → amber Medium, low → red Low.
function ConfidenceBadge({ conf }: ConfidenceBadgeProps) {
  const map = {
    high: { label: 'High', cls: 'bg-green-100 text-green-700' },
    medium: { label: 'Medium', cls: 'bg-amber-100 text-amber-700' },
    low: { label: 'Low', cls: 'bg-red-100 text-red-700' },
  } as const;
  const c = map[conf];
  return (
    <span
      className={cn('inline-block rounded px-1.5 py-0.5 text-xs font-medium', c.cls)}
    >
      {c.label}
    </span>
  );
}

interface EditableCellProps {
  value: string;
  edited: boolean;
  editing: boolean;
  draft: string;
  onStart: () => void;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  /** Use the IPA/diacritic-aware input (palette + hotkeys) for this cell. */
  special?: boolean;
}
function EditableCell({
  value,
  edited,
  editing,
  draft,
  onStart,
  onChange,
  onCommit,
  onCancel,
  special,
}: EditableCellProps) {
  if (editing) {
    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onCommit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    if (special) {
      return (
        <SpecialInput
          autoFocus
          value={draft}
          onChange={onChange}
          onBlur={onCommit}
          onKeyDown={onKeyDown}
          className="h-8 text-sm"
        />
      );
    }
    return (
      <Input
        autoFocus
        value={draft}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={onKeyDown}
        className="h-8 text-sm"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={onStart}
      className={cn(
        'text-left w-full hover:bg-muted/40 rounded px-1 -mx-1 py-0.5',
        edited && 'italic text-muted-foreground',
      )}
    >
      {value || <span className="text-muted-foreground/60 italic">click to add</span>}
    </button>
  );
}

interface RowPillsProps {
  options: NameId[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  swatch: (name: string) => { bg: string; text: string };
}
function RowPills({ options, selectedIds, onChange, swatch }: RowPillsProps) {
  return (
    <MultiSelectChips
      options={options}
      selectedIds={selectedIds}
      onChange={onChange}
      swatch={swatch}
      placeholder="—"
    />
  );
}
