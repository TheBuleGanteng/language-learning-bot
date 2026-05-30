'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { BulkImageDialog } from '@/components/vocab/bulk-image-dialog';
import { DisplayNameGate } from '@/components/display-name-gate';
import { canShare, type UserRole } from '@/lib/roles';
import { withBase } from '@/lib/base-path';

interface BulkSelectBarProps {
  /** All selectable item IDs in the current view. */
  allIds: string[];
  /** Currently selected IDs (controlled from parent). */
  selectedIds: string[];
  // Callbacks
  onSelectAll: () => void;
  onClearSelection: () => void;
  /**
   * Part of the shared selection API — invoked by the parent's per-row
   * checkboxes (§2c). The bar itself does not call it.
   */
  onToggleItem: (id: string) => void;
  // Which actions to show — both default true
  showGenerateImages?: boolean;
  showShareUnshare?: boolean;
  // Passed through to action handlers
  userRole: UserRole;
  userId: string;
  /** The current user's display name; gates the share action (§2b). */
  userDisplayName: string | null;
  /**
   * When provided, the bar delegates the Generate Images confirmation to the
   * parent (so a page with its own batch progress/polling can drive it).
   * When omitted, the bar performs the generate POST itself.
   */
  onGenerateConfirm?: (vocabIds: string[]) => Promise<void>;
  /** Called after a successful share/unshare so the parent can refresh. */
  onShareDone?: () => void;
}

export function BulkSelectBar({
  allIds,
  selectedIds,
  onSelectAll,
  onClearSelection,
  showGenerateImages = true,
  showShareUnshare = true,
  userRole,
  userDisplayName,
  onGenerateConfirm,
  onShareDone,
}: BulkSelectBarProps) {
  const [genOpen, setGenOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareVisibility, setShareVisibility] = useState<'shared' | 'private'>('shared');
  const [shareBusy, setShareBusy] = useState(false);

  const selectedSet = new Set(selectedIds);
  const selectedCount = selectedIds.length;
  const hasSelection = selectedCount > 0;
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedSet.has(id));
  const indeterminate = hasSelection && !allSelected;

  function onHeaderToggle() {
    if (allSelected) onClearSelection();
    else onSelectAll();
  }

  /** Built-in generate used when the parent doesn't supply onGenerateConfirm. */
  async function defaultGenerate(vocabIds: string[]) {
    const res = await fetch(withBase('/api/vocab/generate-images'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ vocabIds }),
    });
    if (res.status === 402) {
      const data = await res.json().catch(() => ({}));
      toast.error(data?.message ?? 'Hard stop reached.');
      throw new Error('hard-stop');
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data?.error ?? 'Bulk generate failed.');
      throw new Error('generate-failed');
    }
    const data = (await res.json()) as { total: number };
    toast.success(`Started generating ${data.total} image${data.total === 1 ? '' : 's'}.`);
    // Nudge the global BatchWatcher to poll immediately.
    window.dispatchEvent(new CustomEvent('batch-started'));
  }

  async function handleGenerateConfirm(vocabIds: string[]) {
    // On failure the handler throws — we leave the dialog open and keep the
    // selection so the user can retry. On success we close + clear.
    if (onGenerateConfirm) await onGenerateConfirm(vocabIds);
    else await defaultGenerate(vocabIds);
    setGenOpen(false);
    onClearSelection();
  }

  async function confirmShare() {
    setShareBusy(true);
    try {
      const res = await fetch(withBase('/api/vocab/bulk-visibility'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds, visibility: shareVisibility }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error('share-failed');
      const updated = d.updated ?? 0;
      const skipped = d.skipped ?? 0;
      toast.success(
        skipped > 0
          ? `Updated ${updated} items. ${skipped} skipped (not your content).`
          : `Updated ${updated} items.`,
      );
      onShareDone?.();
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setShareBusy(false);
      // After confirm (success or error): clear selection (§2b).
      setShareOpen(false);
      onClearSelection();
    }
  }

  const showShareButton = showShareUnshare && canShare(userRole);

  return (
    <div className="flex items-center gap-3 flex-wrap rounded-md border bg-muted/40 px-3 py-2">
      <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
        <Checkbox
          checked={allSelected}
          indeterminate={indeterminate}
          onCheckedChange={onHeaderToggle}
          aria-label={allSelected ? 'Clear selection' : 'Select all'}
        />
        {hasSelection ? (
          <span className="font-medium">{selectedCount.toLocaleString()} selected</span>
        ) : (
          <span>Select all</span>
        )}
      </label>

      {hasSelection && (
        <Button size="xs" variant="ghost" onClick={onClearSelection}>
          Clear
        </Button>
      )}

      {hasSelection && (
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {showGenerateImages && (
            <Button size="xs" onClick={() => setGenOpen(true)}>
              Generate Images
            </Button>
          )}
          {showShareButton && (
            <DisplayNameGate userDisplayName={userDisplayName}>
              <Button size="xs" variant="outline" onClick={() => setShareOpen(true)}>
                Share / Unshare
              </Button>
            </DisplayNameGate>
          )}
        </div>
      )}

      <BulkImageDialog
        open={genOpen}
        onOpenChange={setGenOpen}
        selectedCount={selectedCount}
        vocabIds={selectedIds}
        onConfirm={handleGenerateConfirm}
      />

      <AlertDialog open={shareOpen} onOpenChange={(o) => !shareBusy && setShareOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update visibility</AlertDialogTitle>
            <AlertDialogDescription>
              Items you didn&apos;t create are skipped automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-1 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="bulk-visibility"
                checked={shareVisibility === 'shared'}
                onChange={() => setShareVisibility('shared')}
              />
              Share selected items
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="bulk-visibility"
                checked={shareVisibility === 'private'}
                onChange={() => setShareVisibility('private')}
              />
              Unshare selected items
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={shareBusy}>Cancel</AlertDialogCancel>
            <Button onClick={confirmShare} disabled={shareBusy || selectedCount === 0}>
              {shareBusy ? 'Saving…' : 'Confirm'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
