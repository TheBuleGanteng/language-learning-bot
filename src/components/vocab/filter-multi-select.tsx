'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import type { FilterOption } from './filter-accordion';

interface Props {
  title: string;
  options: FilterOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  /** Small color swatch next to each option (lesson / tag colors). */
  swatch?: (option: FilterOption) => { bg: string };
  emptyHint?: string;
}

/**
 * Compact multi-select dropdown used inside the consolidated Filters accordion
 * (item 10). Same search + select-all/clear + checkbox-list behavior as the old
 * inline {@link FilterAccordion}, but as a small popover trigger ("Title · N")
 * so several filters can sit side by side in a responsive row.
 */
export function FilterMultiSelect({
  title,
  options,
  selected,
  onChange,
  swatch,
  emptyHint,
}: Props) {
  const t = useTranslations('vocab');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, search]);

  function selectAllVisible() {
    const next = new Set(selected);
    for (const o of filtered) next.add(o.id);
    onChange(next);
  }
  function clearSelection() {
    if (selected.size === 0) return;
    onChange(new Set());
  }
  function toggle(id: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    onChange(next);
  }

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border px-2.5 h-8 text-sm bg-background hover:bg-muted/40',
          selected.size > 0 && 'border-foreground/40',
        )}
      >
        <span className="font-medium">{title}</span>
        {selected.size > 0 && (
          <span className="inline-flex items-center justify-center rounded-full bg-foreground px-1.5 text-[10px] font-semibold text-background">
            {selected.size}
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        {options.length === 0 ? (
          <p className="text-xs text-muted-foreground">{emptyHint ?? 'Nothing here yet.'}</p>
        ) : (
          <div className="space-y-2">
            <div className="relative">
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('filterPlaceholder', { name: title })}
                className="pr-8 h-8 text-sm"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={selectAllVisible}
                title="Selects all visible options"
                className="underline text-muted-foreground hover:text-foreground"
              >
                {t('selectAll')}
              </button>
              <span className="text-muted-foreground">·</span>
              <button
                type="button"
                onClick={clearSelection}
                className="underline text-muted-foreground hover:text-foreground"
              >
                {t('clearSelection')}
              </button>
            </div>
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No matches</p>
            ) : (
              <ul className="space-y-1 max-h-64 overflow-y-auto pr-1">
                {filtered.map((o) => {
                  const sw = swatch?.(o);
                  return (
                    <li key={o.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        id={`ms-${o.id}`}
                        checked={selected.has(o.id)}
                        onCheckedChange={(c) => toggle(o.id, c === true)}
                      />
                      {sw && (
                        <span
                          aria-hidden="true"
                          className={cn('inline-block h-2.5 w-2.5 rounded-full', sw.bg)}
                        />
                      )}
                      <label htmlFor={`ms-${o.id}`} className="cursor-pointer truncate">
                        {o.name}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
