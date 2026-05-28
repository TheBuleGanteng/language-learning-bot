'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface Props {
  value: Date | null;
  placeholder?: string;
  /** Throw to leave the popover open. */
  onSave: (newValue: Date | null) => Promise<void>;
  className?: string;
}

export function InlineDateEdit({
  value,
  placeholder = 'Click to add date',
  onSave,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSelect(date: Date | undefined) {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(date ?? null);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(null);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  const isEmpty = !value;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="Edit date"
            className={cn(
              'group inline-flex items-center gap-2 text-left rounded -mx-1 px-1 hover:bg-muted/50 transition-colors',
              className,
            )}
          >
            <span className={isEmpty ? 'text-muted-foreground italic' : ''}>
              {isEmpty ? placeholder : format(value!, 'MMM d, yyyy')}
            </span>
            <Pencil className="h-3.5 w-3.5 opacity-30 group-hover:opacity-100 transition-opacity shrink-0" />
          </button>
        }
      />
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={value ?? undefined}
          onSelect={handleSelect}
          disabled={saving}
          autoFocus
        />
        {value && (
          <div className="border-t p-2 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={clear}
              disabled={saving}
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
