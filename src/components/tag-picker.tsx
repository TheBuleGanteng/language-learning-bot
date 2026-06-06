'use client';

import { useEffect, useState } from 'react';
import { MultiSelectChips, type NameId } from '@/components/multi-select-chips';
import { NewTagDialog } from '@/components/new-tag-dialog';
import { colorForTag } from '@/lib/colors';
import { withBase } from '@/lib/base-path';

interface TagPickerProps {
  selectedTagIds: string[];
  onChange: (ids: string[]) => void;
}

/**
 * Multi-select tag picker with pills and a "+ Create new tag" action that
 * opens the shared <NewTagDialog>, POSTs the name to /api/tags, then adds and
 * selects the resulting tag.
 */
export function TagPicker({ selectedTagIds, onChange }: TagPickerProps) {
  const [options, setOptions] = useState<NameId[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    fetch(withBase('/api/tags'))
      .then((r) => r.json())
      .then((d: { tags?: NameId[] }) => setOptions(d.tags ?? []))
      .catch(() => setOptions([]));
  }, []);

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
      <NewTagDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(tag) => {
          setOptions((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]));
          if (!selectedTagIds.includes(tag.id)) onChange([...selectedTagIds, tag.id]);
        }}
      />
    </>
  );
}
