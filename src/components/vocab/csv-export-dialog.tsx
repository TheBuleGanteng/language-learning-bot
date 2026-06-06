'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { VOCAB_CSV_FIELDS, type VocabCsvField } from '@/lib/csv-export';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Number of selected vocab rows that will be exported (for the button label). */
  count: number;
  /** Build + download the CSV with only the ticked columns. */
  onDownload: (fields: VocabCsvField[]) => void;
}

const ALL_FIELDS = VOCAB_CSV_FIELDS.map((f) => f.key);

/**
 * Field-picker popup that sits between the Export button and the download
 * (item 2). Tickboxes for each exportable column (all ticked by default), a
 * Select-all/none convenience toggle, a Download button disabled when nothing
 * is ticked, and Cancel. The CSV itself is still built client-side by the
 * caller (no server round-trip). Desktop-only — its launcher lives in a
 * `hidden md:flex` group.
 */
export function CsvExportDialog({ open, onOpenChange, count, onDownload }: Props) {
  const [selected, setSelected] = useState<Set<VocabCsvField>>(() => new Set(ALL_FIELDS));

  // Each time the popup opens, start fresh with every column ticked.
  useEffect(() => {
    if (open) setSelected(new Set(ALL_FIELDS));
  }, [open]);

  function toggle(key: VocabCsvField, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  const allTicked = selected.size === ALL_FIELDS.length;
  const noneTicked = selected.size === 0;

  function toggleAll() {
    setSelected(allTicked ? new Set() : new Set(ALL_FIELDS));
  }

  function handleDownload() {
    if (noneTicked) return;
    // Emit in the canonical column order, not tick order.
    onDownload(ALL_FIELDS.filter((k) => selected.has(k)));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export to CSV</DialogTitle>
          <DialogDescription>
            Choose which columns to include for {count} selected{' '}
            {count === 1 ? 'item' : 'items'}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <button
            type="button"
            onClick={toggleAll}
            className="text-xs underline text-muted-foreground hover:text-foreground"
          >
            {allTicked ? 'Select none' : 'Select all'}
          </button>
          <ul className="space-y-2">
            {VOCAB_CSV_FIELDS.map((f) => (
              <li key={f.key} className="flex items-center gap-2 text-sm">
                <Checkbox
                  id={`csv-field-${f.key}`}
                  checked={selected.has(f.key)}
                  onCheckedChange={(c) => toggle(f.key, c === true)}
                />
                <label htmlFor={`csv-field-${f.key}`} className="cursor-pointer">
                  {f.header}
                </label>
              </li>
            ))}
          </ul>
          {noneTicked && (
            <p className="text-xs text-muted-foreground">
              Tick at least one column to enable the download.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleDownload} disabled={noneTicked}>
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
