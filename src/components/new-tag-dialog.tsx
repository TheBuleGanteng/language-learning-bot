'use client';

import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { NameId } from '@/components/multi-select-chips';
import { withBase } from '@/lib/base-path';

interface NewTagDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Called with the created tag (or the existing/shared tag the server
   * auto-merged it into — case-insensitive — so callers never get a duplicate).
   */
  onCreated: (tag: NameId) => void;
}

/**
 * The shared "+ Create new tag" dialog: POSTs the name to /api/tags (which
 * find-or-creates and auto-merges with an existing shared tag of the same
 * name, case-insensitively), then hands the resulting tag back to the caller.
 * Used by the vocab-form TagPicker and the photo-extraction review so both
 * share one creatable-tag behavior.
 */
export function NewTagDialog({ open, onOpenChange, onCreated }: NewTagDialogProps) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset to a clean slate each time the dialog opens.
  useEffect(() => {
    if (open) {
      setName('');
      setError(null);
      setSaving(false);
    }
  }, [open]);

  async function handleCreate() {
    if (saving) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(withBase('/api/tags'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? 'Failed to create tag');
      }
      const tag = (await res.json()) as NameId;
      onCreated(tag);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create tag');
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onOpenChange(false); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New tag</DialogTitle>
          <DialogDescription>Create a tag and add it to this item.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1 py-1">
          <Label htmlFor="new-tag-name">Name</Label>
          <Input
            id="new-tag-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. food"
            autoFocus
            disabled={saving}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleCreate();
              }
            }}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={saving || !name.trim()}>
            {saving ? 'Creating…' : 'Create tag'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
