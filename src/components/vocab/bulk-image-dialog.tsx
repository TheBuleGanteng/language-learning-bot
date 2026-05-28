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
import { toast } from 'sonner';

interface SpendSnapshot {
  currentSpend: number;
  hardStop: number;
  reminder: number;
  nextReminderBand: number;
  provider: string;
  model: string;
  estimatedCostPerImage: number;
  monthLabel: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  onConfirm: (vocabIds: string[]) => Promise<void>;
  vocabIds: string[];
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

const PROVIDER_LABEL: Record<string, string> = {
  google: 'Google',
  openai: 'OpenAI',
};

export function BulkImageDialog({
  open,
  onOpenChange,
  selectedCount,
  vocabIds,
  onConfirm,
}: Props) {
  const [spend, setSpend] = useState<SpendSnapshot | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSpend(null);
    fetch('/api/settings/image-spend')
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => setSpend(s ?? null));
  }, [open]);

  if (!spend) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate images</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Loading spend snapshot…</p>
        </DialogContent>
      </Dialog>
    );
  }

  const costPerImage = spend.estimatedCostPerImage;
  const requestedCost = costPerImage * selectedCount;
  const projectedSpend = spend.currentSpend + requestedCost;
  const exceedsHardStop = projectedSpend > spend.hardStop;
  const remainingBudget = Math.max(0, spend.hardStop - spend.currentSpend);
  const affordable =
    costPerImage > 0 ? Math.max(0, Math.floor(remainingBudget / costPerImage)) : 0;
  const triggersReminder =
    spend.reminder > 0 && projectedSpend >= spend.nextReminderBand;

  async function fire(ids: string[]) {
    setConfirming(true);
    try {
      await onConfirm(ids);
    } finally {
      setConfirming(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !confirming && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate images</DialogTitle>
          <DialogDescription>
            You&apos;re about to generate {selectedCount.toLocaleString()} image
            {selectedCount === 1 ? '' : 's'}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Provider</span>
              <span>{PROVIDER_LABEL[spend.provider] ?? spend.provider}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Model</span>
              <span>{spend.model}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cost per image</span>
              <span>${costPerImage.toFixed(3)}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span className="text-muted-foreground">Estimated total</span>
              <span>{fmtUsd(requestedCost)}</span>
            </div>
          </div>
          <div className="space-y-1 border-t pt-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Month-to-date</span>
              <span>{fmtUsd(spend.currentSpend)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">After this generation</span>
              <span className={exceedsHardStop ? 'text-red-600 font-medium' : ''}>
                {fmtUsd(projectedSpend)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Monthly hard stop</span>
              <span>{fmtUsd(spend.hardStop)}</span>
            </div>
          </div>
          {exceedsHardStop ? (
            <div className="border-t pt-3 space-y-2 text-amber-700">
              <p className="font-medium">Cannot generate full batch.</p>
              <p>This would exceed your monthly hard stop.</p>
              <p className="text-muted-foreground">
                Items affordable: {affordable.toLocaleString()} (
                {fmtUsd(affordable * costPerImage)})
              </p>
            </div>
          ) : (
            triggersReminder && (
              <p className="border-t pt-3 text-amber-700">
                ⚠ This will trigger a reminder at $
                {spend.nextReminderBand.toFixed(2)}.
              </p>
            )
          )}
          <p className="text-xs text-muted-foreground">
            Images will be generated in the background. You&apos;ll see progress on
            this page.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={confirming}>
            Cancel
          </Button>
          {exceedsHardStop ? (
            affordable > 0 ? (
              <Button
                onClick={() => fire(vocabIds.slice(0, affordable))}
                disabled={confirming}
              >
                {confirming ? 'Starting…' : `Generate ${affordable} affordable`}
              </Button>
            ) : (
              <Button
                onClick={() => {
                  toast.error('Raise your hard stop in Settings to continue.');
                  onOpenChange(false);
                }}
              >
                Open Settings
              </Button>
            )
          ) : (
            <Button onClick={() => fire(vocabIds)} disabled={confirming}>
              {confirming
                ? 'Starting…'
                : `Generate ${selectedCount.toLocaleString()} image${selectedCount === 1 ? '' : 's'}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
