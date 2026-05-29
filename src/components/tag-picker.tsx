'use client';

import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiSelectChips, type NameId } from '@/components/multi-select-chips';
import { colorForTag } from '@/lib/colors';

interface TagPickerProps {
  selectedTagIds: string[];
  onChange: (ids: string[]) => void;
}

/**
 * Multi-select tag picker with pills and a "+ Create new tag" action that
 * opens a tiny dialog, POSTs the name to /api/tags, then adds and selects it.
 */
export function TagPicker({ selectedTagIds, onChange }: TagPickerProps) {
  const [options, setOptions] = useState<NameId[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/tags')
      .then((r) => r.json())
      .then((d: { tags?: NameId[] }) => setOptions(d.tags ?? []))
      .catch(() => setOptions([]));
  }, []);

  function closeCreate() {
    setCreateOpen(false);
    setName('');
    setError(null);
    setSaving(false);
  }

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
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? 'Failed to create tag');
      }
      const tag = (await res.json()) as NameId;
      setOptions((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]));
      if (!selectedTagIds.includes(tag.id)) onChange([...selectedTagIds, tag.id]);
      closeCreate();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create tag');
      setSaving(false);
    }
  }

  return (
    <>
      <MultiSelectChips
        options={options}
        selectedIds={selectedTagIds}
        onChange={onChange}
        swatch={colorForTag}
        placeholder="No tags"
        onCreateNew={() => setCreateOpen(true)}
        createNewLabel="+ Create new tag"
      />
      <Dialog open={createOpen} onOpenChange={(o) => { if (!o) closeCreate(); }}>
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
            <Button variant="outline" onClick={closeCreate} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={saving || !name.trim()}>
              {saving ? 'Creating…' : 'Create tag'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
