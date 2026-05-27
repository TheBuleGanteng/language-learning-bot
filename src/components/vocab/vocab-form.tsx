'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export interface VocabFormValue {
  id?: string;
  targetText: string;
  nativeText: string;
  transliteration: string;
  pos: string;
  exampleTarget: string;
  exampleNative: string;
  notes: string;
  lessonName: string;
  tagNames: string;
}

const EMPTY: VocabFormValue = {
  targetText: '',
  nativeText: '',
  transliteration: '',
  pos: '',
  exampleTarget: '',
  exampleNative: '',
  notes: '',
  lessonName: '',
  tagNames: '',
};

interface Props {
  initial?: Partial<VocabFormValue>;
  mode: 'new' | 'edit';
}

export function VocabForm({ initial, mode }: Props) {
  const router = useRouter();
  const [v, setV] = useState<VocabFormValue>({ ...EMPTY, ...initial });
  const [busy, setBusy] = useState(false);
  const [lessonSuggestions, setLessonSuggestions] = useState<string[]>([]);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const [lr, tr] = await Promise.all([
        fetch('/api/lessons').then((r) => r.json()),
        fetch('/api/tags').then((r) => r.json()),
      ]);
      setLessonSuggestions((lr.lessons ?? []).map((l: { name: string }) => l.name));
      setTagSuggestions((tr.tags ?? []).map((t: { name: string }) => t.name));
    })();
  }, []);

  function on<K extends keyof VocabFormValue>(k: K, val: VocabFormValue[K]) {
    setV({ ...v, [k]: val });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        targetText: v.targetText.trim(),
        nativeText: v.nativeText.trim(),
        transliteration: v.transliteration.trim() || null,
        pos: v.pos.trim() || null,
        exampleTarget: v.exampleTarget.trim() || null,
        exampleNative: v.exampleNative.trim() || null,
        notes: v.notes.trim() || null,
        lessonName: v.lessonName.trim() || (mode === 'edit' ? '' : undefined),
        tagNames: v.tagNames
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      };
      const url = mode === 'new' ? '/api/vocab' : `/api/vocab/${initial?.id}`;
      const method = mode === 'new' ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.error ?? 'Save failed');
        return;
      }
      toast.success(mode === 'new' ? 'Vocab added' : 'Vocab updated');
      router.push('/vocab');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-2xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="targetText">Target (Thai)</Label>
          <Input
            id="targetText"
            required
            value={v.targetText}
            onChange={(e) => on('targetText', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nativeText">English</Label>
          <Input
            id="nativeText"
            required
            value={v.nativeText}
            onChange={(e) => on('nativeText', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="transliteration">Transliteration (optional)</Label>
          <Input
            id="transliteration"
            value={v.transliteration}
            onChange={(e) => on('transliteration', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pos">Part of speech (optional)</Label>
          <Input id="pos" value={v.pos} onChange={(e) => on('pos', e.target.value)} />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="lessonName">Lesson (existing or new)</Label>
          <Input
            id="lessonName"
            list="lesson-suggestions"
            value={v.lessonName}
            onChange={(e) => on('lessonName', e.target.value)}
            placeholder="e.g. Lesson 3"
          />
          <datalist id="lesson-suggestions">
            {lessonSuggestions.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="tagNames">Tags (comma-separated)</Label>
          <Input
            id="tagNames"
            list="tag-suggestions"
            value={v.tagNames}
            onChange={(e) => on('tagNames', e.target.value)}
            placeholder="e.g. food, greetings"
          />
          <datalist id="tag-suggestions">
            {tagSuggestions.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="exampleTarget">Example sentence (target)</Label>
          <Input
            id="exampleTarget"
            value={v.exampleTarget}
            onChange={(e) => on('exampleTarget', e.target.value)}
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="exampleNative">Example sentence (English)</Label>
          <Input
            id="exampleNative"
            value={v.exampleNative}
            onChange={(e) => on('exampleNative', e.target.value)}
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="notes">Notes</Label>
          <Input
            id="notes"
            value={v.notes}
            onChange={(e) => on('notes', e.target.value)}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : mode === 'new' ? 'Add vocab' : 'Save changes'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/vocab')}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
