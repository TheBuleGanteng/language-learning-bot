'use client';

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

export interface FilterOption {
  id: string;
  name: string;
}

interface Props {
  title: string;
  /** Unique slug used as the AccordionItem value and the localStorage key suffix. */
  slug: string;
  options: FilterOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  /** Renders a small color swatch next to each option (e.g., lesson / tag colors). */
  swatch?: (option: FilterOption) => { bg: string };
  /** Empty-state copy when no options exist at all. */
  emptyHint?: string;
}

const LS_OPEN_PREFIX = 'lang.filters.';

export function FilterAccordion({
  title,
  slug,
  options,
  selected,
  onChange,
  swatch,
  emptyHint,
}: Props) {
  const lsKey = `${LS_OPEN_PREFIX}${slug}.open`;
  // Default expanded. Hydrate from localStorage on mount.
  const [openValue, setOpenValue] = useState<string[]>([slug]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw !== null) {
        setOpenValue(raw === '1' ? [slug] : []);
      }
    } catch {
      // localStorage unavailable — keep default
    }
  }, [lsKey, slug]);

  function persistOpen(next: string[]) {
    setOpenValue(next);
    try {
      localStorage.setItem(lsKey, next.includes(slug) ? '1' : '0');
    } catch {
      // ignore
    }
  }

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
    <Accordion
      value={openValue}
      onValueChange={(v) => persistOpen(v as string[])}
      className="border rounded-md overflow-hidden"
    >
      <AccordionItem value={slug}>
        <AccordionTrigger>
          <span className="text-sm font-semibold">
            {title}
            {selected.size > 0 && (
              <span className="ml-2 text-xs text-muted-foreground">({selected.size})</span>
            )}
          </span>
        </AccordionTrigger>
        <AccordionContent>
          {options.length === 0 ? (
            <p className="text-xs text-muted-foreground">{emptyHint ?? 'Nothing here yet.'}</p>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Filter ${title.toLowerCase()}…`}
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
                  Select all
                </button>
                <span className="text-muted-foreground">·</span>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="underline text-muted-foreground hover:text-foreground"
                >
                  Clear selection
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
                          id={`${slug}-${o.id}`}
                          checked={selected.has(o.id)}
                          onCheckedChange={(c) => toggle(o.id, c === true)}
                        />
                        {sw && (
                          <span
                            aria-hidden="true"
                            className={cn('inline-block h-2.5 w-2.5 rounded-full', sw.bg)}
                          />
                        )}
                        <label
                          htmlFor={`${slug}-${o.id}`}
                          className="cursor-pointer truncate"
                        >
                          {o.name}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
