'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
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
import { AddToDeckDialog } from '@/components/vocab/add-to-deck-dialog';
import { BulkEditDialog, type BulkEditItem } from '@/components/vocab/bulk-edit-dialog';
import { DisplayNameGate } from '@/components/display-name-gate';
import { canShare, type UserRole } from '@/lib/roles';
import {
  COMPREHENSION_LEVELS,
  COMPREHENSION_META,
  type ComprehensionLevel,
} from '@/lib/comprehension';
import { cn } from '@/lib/utils';
import { Star } from 'lucide-react';
import { withBase } from '@/lib/base-path';
import { emitBatchStarted, emitBatchError } from '@/lib/bulk-gen-events';

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
  /** Target language code — drives deck creation labels + navigation (§7/§8). */
  lang: string;
  /** Single active tag/lesson filter, used to detect a refreshable deck source. */
  activeTag?: { id: string; name: string } | null;
  activeLesson?: { id: string; name: string } | null;
  /** Vocab page deck-builder mode (§7): show a single "Create deck" action. */
  deckBuilderMode?: boolean;
  /**
   * When provided, the bar delegates the Generate Images confirmation to the
   * parent (so a page with its own batch progress/polling can drive it).
   * When omitted, the bar performs the generate POST itself.
   */
  onGenerateConfirm?: (vocabIds: string[]) => Promise<void>;
  /** Called after a successful share/unshare so the parent can refresh. */
  onShareDone?: () => void;
  /** Show the "Edit tags & lessons" bulk action (desktop button + mobile sticky bar). */
  showEditTagsLessons?: boolean;
  /** Selected items' tags/lessons — needed to build the bulk-edit "Remove" options. */
  selectedItems?: BulkEditItem[];
  /** Called after a successful bulk tag/lesson edit so the parent can refresh. */
  onBulkEdited?: () => void;
  /** Show the per-user bulk actions: Set comprehension, Star, Unstar. */
  showStarComprehension?: boolean;
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
  lang,
  activeTag = null,
  activeLesson = null,
  deckBuilderMode = false,
  onGenerateConfirm,
  onShareDone,
  showEditTagsLessons = false,
  selectedItems = [],
  onBulkEdited,
  showStarComprehension = false,
}: BulkSelectBarProps) {
  const t = useTranslations('bulkSelect');
  const tc = useTranslations('common');
  const [genOpen, setGenOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [deckOpen, setDeckOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [compOpen, setCompOpen] = useState(false);
  const [personalBusy, setPersonalBusy] = useState(false);

  // Per-user bulk personal-state writes (comprehension / star). On success,
  // refresh the parent's list and clear the selection.
  async function runPersonal(url: string, body: Record<string, unknown>, okMsg: string) {
    if (personalBusy || selectedIds.length === 0) return;
    setPersonalBusy(true);
    try {
      const res = await fetch(withBase(url), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: selectedIds, ...body }),
      });
      if (!res.ok) throw new Error();
      const d = (await res.json().catch(() => ({}))) as { updated?: number };
      toast.success(`${okMsg} (${d.updated ?? selectedIds.length})`);
      setCompOpen(false);
      onBulkEdited?.();
      onClearSelection();
    } catch {
      toast.error(t('genericError'));
    } finally {
      setPersonalBusy(false);
    }
  }
  const setComprehension = (level: ComprehensionLevel) =>
    runPersonal('/api/vocab/comprehension', { level }, 'Comprehension updated');
  const setStarred = (starred: boolean) =>
    runPersonal('/api/vocab/star', { starred }, starred ? 'Starred' : 'Unstarred');
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
      // Surface via the global bulk-gen toast (red Error: …) per Part 6.
      emitBatchError(data?.message ?? t('hardStop'));
      throw new Error('hard-stop');
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      emitBatchError(data?.error ?? t('generateFailed'));
      throw new Error('generate-failed');
    }
    // Nudge the global bulk-gen toast to poll immediately.
    emitBatchStarted();
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
          ? t('updatedSkipped', { updated, skipped })
          : t('updated', { count: updated }),
      );
      onShareDone?.();
    } catch {
      toast.error(t('genericError'));
    } finally {
      setShareBusy(false);
      // After confirm (success or error): clear selection (§2b).
      setShareOpen(false);
      onClearSelection();
    }
  }

  const showShareButton = showShareUnshare && canShare(userRole);

  return (
    <div className="flex items-center gap-3 flex-wrap rounded-md border bg-card px-3 py-2">
      <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
        <Checkbox
          checked={allSelected}
          indeterminate={indeterminate}
          onCheckedChange={onHeaderToggle}
          aria-label={allSelected ? t('clearSelection') : t('selectAll')}
        />
        {hasSelection ? (
          <span className="font-medium">{t('selected', { count: selectedCount })}</span>
        ) : (
          <span>{t('selectAll')}</span>
        )}
      </label>

      {hasSelection && (
        <Button size="xs" variant="ghost" onClick={onClearSelection}>
          {t('clear')}
        </Button>
      )}

      {hasSelection && (
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {deckBuilderMode ? (
            <Button size="xs" onClick={() => setDeckOpen(true)}>
              {t('createDeck')}
            </Button>
          ) : (
            <>
              {showEditTagsLessons && (
                <Button
                  size="xs"
                  variant="outline"
                  className="hidden md:inline-flex"
                  onClick={() => setEditOpen(true)}
                >
                  Edit tags &amp; lessons
                </Button>
              )}
              {showStarComprehension && (
                <div className="relative hidden md:inline-block">
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={personalBusy}
                    onClick={() => setCompOpen((v) => !v)}
                  >
                    Set comprehension
                  </Button>
                  {compOpen && (
                    <div className="absolute right-0 top-full z-30 mt-1 w-40 rounded-md border bg-popover p-1 shadow-md">
                      {COMPREHENSION_LEVELS.map((l) => {
                        const m = COMPREHENSION_META[l];
                        return (
                          <button
                            key={l}
                            type="button"
                            onClick={() => setComprehension(l)}
                            className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-muted"
                          >
                            <span className={cn('inline-block h-2.5 w-2.5 rounded-full', m.dot)} />
                            {m.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              {showStarComprehension && (
                <>
                  <Button
                    size="xs"
                    variant="outline"
                    className="hidden gap-1 md:inline-flex"
                    disabled={personalBusy}
                    onClick={() => setStarred(true)}
                  >
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
                    Star
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    className="hidden gap-1 md:inline-flex"
                    disabled={personalBusy}
                    onClick={() => setStarred(false)}
                  >
                    <Star className="h-3.5 w-3.5" />
                    Unstar
                  </Button>
                </>
              )}
              {showGenerateImages && (
                <Button size="xs" onClick={() => setGenOpen(true)}>
                  {t('generateImages')}
                </Button>
              )}
              {showShareButton && (
                <DisplayNameGate userDisplayName={userDisplayName}>
                  <Button size="xs" variant="outline" onClick={() => setShareOpen(true)}>
                    {t('shareUnshare')}
                  </Button>
                </DisplayNameGate>
              )}
              {/* All users can create decks — no role check (§8a). */}
              <Button size="xs" variant="outline" onClick={() => setDeckOpen(true)}>
                {t('addToDeck')}
              </Button>
            </>
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

      <AddToDeckDialog
        open={deckOpen}
        onOpenChange={setDeckOpen}
        lang={lang}
        vocabIds={selectedIds}
        activeTag={activeTag}
        activeLesson={activeLesson}
        forceManual={deckBuilderMode}
        onDone={onClearSelection}
      />

      <AlertDialog open={shareOpen} onOpenChange={(o) => !shareBusy && setShareOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('updateVisibility')}</AlertDialogTitle>
            <AlertDialogDescription>{t('visibilityDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-1 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="bulk-visibility"
                checked={shareVisibility === 'shared'}
                onChange={() => setShareVisibility('shared')}
              />
              {t('shareItems')}
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="bulk-visibility"
                checked={shareVisibility === 'private'}
                onChange={() => setShareVisibility('private')}
              />
              {t('unshareItems')}
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={shareBusy}>{tc('cancel')}</AlertDialogCancel>
            <Button onClick={confirmShare} disabled={shareBusy || selectedCount === 0}>
              {shareBusy ? tc('saving') : t('confirm')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mobile (< md): a sticky bottom bar keeps the per-row bulk actions
          reachable on long lists where the top bar has scrolled away. Desktop
          uses the inline buttons above instead. */}
      {(showEditTagsLessons || showStarComprehension) && !deckBuilderMode && hasSelection && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex flex-wrap items-center gap-2 border-t bg-background px-4 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] md:hidden">
          <span className="text-sm font-medium">{t('selected', { count: selectedCount })}</span>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {showStarComprehension && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={personalBusy}
                  onClick={() => setCompOpen((v) => !v)}
                >
                  Comprehension
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  disabled={personalBusy}
                  onClick={() => setStarred(true)}
                  aria-label="Star selected"
                >
                  <Star className="h-4 w-4 fill-amber-400 text-amber-500" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  disabled={personalBusy}
                  onClick={() => setStarred(false)}
                  aria-label="Unstar selected"
                >
                  <Star className="h-4 w-4" />
                </Button>
              </>
            )}
            {showEditTagsLessons && (
              <Button size="sm" onClick={() => setEditOpen(true)}>
                Edit tags &amp; lessons
              </Button>
            )}
          </div>
          {/* Comprehension chooser for mobile — anchored above the sticky bar. */}
          {showStarComprehension && compOpen && (
            <div className="absolute bottom-full right-4 mb-1 w-40 rounded-md border bg-popover p-1 shadow-md">
              {COMPREHENSION_LEVELS.map((l) => {
                const m = COMPREHENSION_META[l];
                return (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setComprehension(l)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-muted"
                  >
                    <span className={cn('inline-block h-2.5 w-2.5 rounded-full', m.dot)} />
                    {m.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {showEditTagsLessons && (
        <BulkEditDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          lang={lang}
          selectedItems={selectedItems}
          onApplied={() => {
            onBulkEdited?.();
            onClearSelection();
          }}
        />
      )}
    </div>
  );
}
