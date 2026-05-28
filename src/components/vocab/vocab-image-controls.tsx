'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ImageOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

interface Props {
  vocabId: string;
  initialImageUrl: string | null;
  initialStatus: 'none' | 'generating' | 'completed' | 'refused' | 'failed';
  initialOverride: string | null;
}

export function VocabImageControls({
  vocabId,
  initialImageUrl,
  initialStatus,
  initialOverride,
}: Props) {
  const router = useRouter();
  const [imageUrl, setImageUrl] = useState<string | null>(initialImageUrl);
  const [status, setStatus] = useState(initialStatus);
  const [override, setOverride] = useState<string>(initialOverride ?? '');
  const [generating, setGenerating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showConfirm, setShowConfirm] = useState<null | 'regenerate' | 'delete'>(null);
  const [savingOverride, setSavingOverride] = useState(false);

  async function fireGenerate() {
    if (generating) return;
    setGenerating(true);
    setStatus('generating');
    try {
      const res = await fetch(`/api/vocab/${vocabId}/image/generate`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.status === 402) {
        toast.error(data?.message ?? 'Hard stop reached.');
        setStatus(initialStatus);
        return;
      }
      if (!res.ok) {
        toast.error(data?.error ?? 'Generation failed.');
        setStatus('failed');
        return;
      }
      setStatus(data.imageStatus ?? 'completed');
      setImageUrl(data.imageUrl ?? null);
      if (data.bandCrossed) {
        toast.message(
          `You've spent $${(data.bandCrossed.currentSpend as number).toFixed(2)} on image generation this month.`,
        );
      }
      router.refresh();
    } finally {
      setGenerating(false);
    }
  }

  async function fireDelete() {
    const res = await fetch(`/api/vocab/${vocabId}/image`, { method: 'DELETE' });
    if (!res.ok) {
      toast.error('Delete failed');
      return;
    }
    toast.success('Image deleted');
    setImageUrl(null);
    setStatus('none');
    setShowConfirm(null);
    router.refresh();
  }

  async function saveOverride(nextValue: string | null) {
    setSavingOverride(true);
    try {
      const res = await fetch(`/api/vocab/${vocabId}/image-prompt-override`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ override: nextValue }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d?.error ?? 'Save failed');
        return;
      }
      toast.success(nextValue ? 'Prompt override saved' : 'Reset to default prompt');
    } finally {
      setSavingOverride(false);
    }
  }

  return (
    <div className="space-y-3 border rounded-md p-4 max-w-2xl">
      <h2 className="text-sm font-semibold">Image</h2>
      <div className="flex gap-4">
        <div className="shrink-0 w-[200px] h-[200px] rounded-md border flex items-center justify-center bg-muted/30">
          {status === 'generating' ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          ) : imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt="Vocab illustration"
              className="w-full h-full object-cover rounded-md"
            />
          ) : status === 'refused' || status === 'failed' ? (
            <div className="flex flex-col items-center gap-1 text-muted-foreground">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
              <span className="text-xs">
                Previous attempt {status === 'refused' ? 'refused' : 'failed'}
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1 text-muted-foreground">
              <ImageOff className="h-6 w-6" />
              <span className="text-xs">No image yet</span>
            </div>
          )}
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap gap-2">
            {status === 'completed' && imageUrl ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowConfirm('regenerate')}
                  disabled={generating}
                >
                  Regenerate
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => setShowConfirm('delete')}
                  disabled={generating}
                >
                  Delete
                </Button>
              </>
            ) : status === 'generating' ? (
              <span className="text-sm text-muted-foreground">Generating…</span>
            ) : (
              <Button size="sm" onClick={fireGenerate} disabled={generating}>
                {generating
                  ? 'Generating…'
                  : status === 'refused' || status === 'failed'
                    ? 'Regenerate'
                    : 'Generate image'}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              Advanced: customize prompt {showAdvanced ? '▴' : '▾'}
            </Button>
          </div>
          {showAdvanced && (
            <div className="space-y-2 border-t pt-3">
              <Label htmlFor="override">Custom prompt (overrides the default)</Label>
              <textarea
                id="override"
                value={override}
                onChange={(e) => setOverride(e.target.value)}
                rows={6}
                placeholder="Leave blank to use the default template."
                className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => saveOverride(override.trim() || null)}
                  disabled={savingOverride}
                >
                  {savingOverride ? 'Saving…' : 'Save override'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setOverride('');
                    void saveOverride(null);
                  }}
                  disabled={savingOverride || !override}
                >
                  Reset to default
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <AlertDialog
        open={showConfirm !== null}
        onOpenChange={(o) => !o && setShowConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {showConfirm === 'regenerate' ? 'Regenerate this image?' : 'Delete this image?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {showConfirm === 'regenerate'
                ? 'The current image will be deleted. A new one will be generated using your current image-model setting.'
                : 'The image will be removed. You can generate a new one later. The vocab item itself is preserved.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (showConfirm === 'regenerate') {
                  setShowConfirm(null);
                  void fireGenerate();
                } else {
                  void fireDelete();
                }
              }}
            >
              {showConfirm === 'regenerate' ? 'Regenerate' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
