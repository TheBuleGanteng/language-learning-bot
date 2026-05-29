'use client';

import { useMemo, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface NameId {
  id: string;
  name: string;
}

export interface MultiSelectChipsProps {
  options: NameId[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  swatch: (name: string) => { bg: string; text: string };
  placeholder: string;
  /** When set, renders an action at the top of the dropdown (e.g. "+ Create new lesson"). */
  onCreateNew?: () => void;
  createNewLabel?: string;
}

/**
 * Pills for the current selection + a popover with a filter input and a
 * checkbox-style list of options. Optionally renders a "+ Create new …"
 * action pinned to the top of the popover. Shared by the photo-extraction
 * bulk picker and the vocab-form LessonPicker / TagPicker.
 */
export function MultiSelectChips({
  options,
  selectedIds,
  onChange,
  swatch,
  placeholder,
  onCreateNew,
  createNewLabel,
}: MultiSelectChipsProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');

  const selectedOptions = useMemo(
    () => options.filter((o) => selectedIds.includes(o.id)),
    [options, selectedIds],
  );
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, filter]);

  function toggle(id: string) {
    if (selectedIds.includes(id)) onChange(selectedIds.filter((x) => x !== id));
    else onChange([...selectedIds, id]);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full min-h-[2rem] border rounded-md px-2 py-1 text-left text-sm bg-background hover:bg-muted/40"
      >
        {selectedOptions.length === 0 ? (
          <span className="text-muted-foreground italic">{placeholder}</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {selectedOptions.map((o) => {
              const c = swatch(o.name);
              return (
                <Badge
                  key={o.id}
                  variant="outline"
                  className={cn('border-transparent', c.bg, c.text)}
                >
                  {o.name}
                </Badge>
              );
            })}
          </div>
        )}
      </button>
      {open && (
        <div className="absolute z-20 top-full left-0 mt-1 w-full max-h-64 overflow-y-auto rounded-md border bg-popover shadow-md">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter…"
            className="h-8 text-sm border-0 border-b rounded-none focus-visible:ring-0"
          />
          {onCreateNew && (
            <div className="border-b p-1">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onCreateNew();
                }}
                className="w-full flex items-center gap-2 rounded px-2 py-1 text-sm text-left font-medium text-blue-700 hover:bg-muted dark:text-blue-400"
              >
                <Plus className="h-3.5 w-3.5" />
                {createNewLabel ?? 'Create new'}
              </button>
            </div>
          )}
          <ul className="p-1 space-y-0.5">
            {filtered.map((o) => {
              const isSel = selectedIds.includes(o.id);
              const c = swatch(o.name);
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => toggle(o.id)}
                    className={cn(
                      'w-full flex items-center gap-2 rounded px-2 py-1 text-sm text-left hover:bg-muted',
                      isSel && 'font-medium',
                    )}
                  >
                    <span className={cn('inline-block h-2.5 w-2.5 rounded-full', c.bg)} />
                    <span className="flex-1">{o.name}</span>
                    {isSel && <Check className="h-3.5 w-3.5" />}
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="px-2 py-1 text-xs text-muted-foreground italic">No matches</li>
            )}
          </ul>
          <div className="flex justify-end border-t p-1">
            <Button size="xs" variant="ghost" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
