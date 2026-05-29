'use client';

import { useEffect, useState } from 'react';
import { MultiSelectChips, type NameId } from '@/components/multi-select-chips';
import { NewLessonDialog } from '@/components/new-lesson-dialog';
import { colorForLesson } from '@/lib/colors';

interface LessonPickerProps {
  selectedLessonIds: string[];
  onChange: (ids: string[]) => void;
  /** Needed for the "+ Create new lesson" flow (navigation target / new-lesson dialog). */
  lang: string;
}

/**
 * Multi-select lesson picker with pills and a "+ Create new lesson" action
 * that opens <NewLessonDialog> in callback mode. Fetches the user's lessons
 * itself and keeps a local options list so freshly-created lessons appear
 * without a round-trip.
 */
export function LessonPicker({ selectedLessonIds, onChange, lang }: LessonPickerProps) {
  const [options, setOptions] = useState<NameId[]>([]);
  const [newLessonOpen, setNewLessonOpen] = useState(false);

  useEffect(() => {
    fetch('/api/lessons')
      .then((r) => r.json())
      .then((d: { lessons?: NameId[] }) => setOptions(d.lessons ?? []))
      .catch(() => setOptions([]));
  }, []);

  return (
    <>
      <MultiSelectChips
        options={options}
        selectedIds={selectedLessonIds}
        onChange={onChange}
        swatch={colorForLesson}
        placeholder="No lessons"
        onCreateNew={() => setNewLessonOpen(true)}
        createNewLabel="+ Create new lesson"
      />
      <NewLessonDialog
        open={newLessonOpen}
        onOpenChange={setNewLessonOpen}
        lang={lang}
        mode="callback"
        onCreated={(lesson) => {
          setOptions((prev) =>
            prev.some((l) => l.id === lesson.id) ? prev : [...prev, lesson],
          );
          if (!selectedLessonIds.includes(lesson.id)) {
            onChange([...selectedLessonIds, lesson.id]);
          }
        }}
      />
    </>
  );
}
