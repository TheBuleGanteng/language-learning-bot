'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/rich-text-editor';
import { lessonPath } from '@/lib/routes';

interface NewLessonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lang: string;
  /**
   * What to do after a successful create.
   * - 'navigate': push to the new lesson's detail page (default; matches lessons-index behavior)
   * - 'callback': call onCreated with the new lesson and don't navigate (used by the picker flow)
   */
  mode?: 'navigate' | 'callback';
  onCreated?: (lesson: { id: string; name: string }) => void;
}

export function NewLessonDialog({
  open, onOpenChange, lang, mode = 'navigate', onCreated,
}: NewLessonDialogProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [topicHtml, setTopicHtml] = useState('');
  const [date, setDate] = useState('');  // ISO date string, e.g., "2026-05-28"
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName('');
    setTopicHtml('');
    setDate('');
    setError(null);
    setSaving(false);
  }

  async function handleSave() {
    if (saving) return;
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/lessons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          topic: topicHtml || null,
          date: date || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to create lesson');
      }
      const lesson = await res.json();

      // Trigger any list refresh on the lessons index
      router.refresh();

      reset();
      onOpenChange(false);

      if (mode === 'callback') {
        onCreated?.(lesson);
      } else {
        router.push(lessonPath(lang, lesson.id));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create lesson');
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New Lesson</DialogTitle>
          <DialogDescription>
            Create a new lesson. You can add vocab, notes, audio, and links to it afterward.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label htmlFor="lesson-name">Name</Label>
            <Input
              id="lesson-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Lesson 35"
              autoFocus
              disabled={saving}
            />
          </div>
          <div className="space-y-1">
            <Label>Topic <span className="text-muted-foreground">(optional)</span></Label>
            <RichTextEditor value={topicHtml} onChange={setTopicHtml} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="lesson-date">Date <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              id="lesson-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={saving}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Creating…' : 'Create lesson'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
