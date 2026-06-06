'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { TagPicker } from '@/components/tag-picker';
import { LessonPicker } from '@/components/lesson-picker';
import { MultiSelectChips, type NameId } from '@/components/multi-select-chips';
import { colorForLesson, colorForTag } from '@/lib/colors';
import { withBase } from '@/lib/base-path';
import { toast } from 'sonner';

/** The selected items' metadata needed to build the "Remove" options union. */
export interface BulkEditItem {
  id: string;
  tags: NameId[];
  lessons: NameId[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lang: string;
  /** The currently-selected vocab items (with their present tags/lessons). */
  selectedItems: BulkEditItem[];
  /** Called after a successful apply so the caller can refresh + clear selection. */
  onApplied: () => void;
}

function unionById(items: NameId[][]): NameId[] {
  const map = new Map<string, NameId>();
  for (const arr of items) for (const x of arr) if (!map.has(x.id)) map.set(x.id, x);
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * One dialog → one request. Adds use the creatable pickers (TagPicker with
 * inline create+merge via NewTagDialog; LessonPicker); removes are limited to
 * the union of tags/lessons actually present on the selected items. Apply sends
 * a single PATCH /api/vocab/bulk with the four delta arrays. Shared by the
 * vocab page and the lesson detail page.
 */
export function BulkEditDialog({ open, onOpenChange, lang, selectedItems, onApplied }: Props) {
  const [tagAdd, setTagAdd] = useState<string[]>([]);
  const [tagRemove, setTagRemove] = useState<string[]>([]);
  const [lessonAdd, setLessonAdd] = useState<string[]>([]);
  const [lessonRemove, setLessonRemove] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Reset all choices each time the dialog opens.
  useEffect(() => {
    if (open) {
      setTagAdd([]);
      setTagRemove([]);
      setLessonAdd([]);
      setLessonRemove([]);
      setSaving(false);
    }
  }, [open]);

  const removableTags = useMemo(
    () => unionById(selectedItems.map((i) => i.tags)),
    [selectedItems],
  );
  const removableLessons = useMemo(
    () => unionById(selectedItems.map((i) => i.lessons)),
    [selectedItems],
  );

  const count = selectedItems.length;
  const hasChoice =
    tagAdd.length > 0 || tagRemove.length > 0 || lessonAdd.length > 0 || lessonRemove.length > 0;

  async function apply() {
    if (saving || !hasChoice) return;
    setSaving(true);
    try {
      const res = await fetch(withBase('/api/vocab/bulk'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemIds: selectedItems.map((i) => i.id),
          tags: { add: tagAdd, remove: tagRemove },
          lessons: { add: lessonAdd, remove: lessonRemove },
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(d.error ?? 'Update failed');
        return; // leave selection + dialog intact for a retry
      }
      const d = (await res.json()) as { updated: number; skipped: number };
      toast.success(
        `Updated ${d.updated} item${d.updated === 1 ? '' : 's'}` +
          (d.skipped > 0 ? ` · ${d.skipped} skipped (not yours)` : ''),
      );
      onApplied();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit tags &amp; lessons</DialogTitle>
          <DialogDescription>
            Add or remove tags and lessons on {count} selected{' '}
            {count === 1 ? 'item' : 'items'}. Only items you created will change.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Tags</h3>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Add</Label>
              <TagPicker selectedTagIds={tagAdd} onChange={setTagAdd} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Remove</Label>
              {removableTags.length > 0 ? (
                <MultiSelectChips
                  options={removableTags}
                  selectedIds={tagRemove}
                  onChange={setTagRemove}
                  swatch={colorForTag}
                  placeholder="Nothing to remove"
                />
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  The selected items have no tags to remove.
                </p>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Lessons</h3>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Add</Label>
              <LessonPicker selectedLessonIds={lessonAdd} onChange={setLessonAdd} lang={lang} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Remove</Label>
              {removableLessons.length > 0 ? (
                <MultiSelectChips
                  options={removableLessons}
                  selectedIds={lessonRemove}
                  onChange={setLessonRemove}
                  swatch={colorForLesson}
                  placeholder="Nothing to remove"
                />
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  The selected items have no lessons to remove.
                </p>
              )}
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={saving || !hasChoice}>
            {saving ? 'Applying…' : 'Apply'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
