'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SpecialInput } from '@/components/special-input';
import { Label } from '@/components/ui/label';
import { LessonPicker } from '@/components/lesson-picker';
import { TagPicker } from '@/components/tag-picker';
import { toast } from 'sonner';
import { vocabPath } from '@/lib/routes';
import { languageName } from '@/lib/languages';
import { localeEnglishName } from '@/lib/locales';
import { withBase } from '@/lib/base-path';

interface NameId {
  id: string;
  name: string;
}

/** Text-only fields edited via plain inputs. Lessons/tags are managed separately. */
interface VocabTextFields {
  targetText: string;
  nativeText: string;
  transliteration: string;
  pos: string;
  exampleTarget: string;
  exampleNative: string;
  notes: string;
}

export interface VocabFormInitial extends Partial<VocabTextFields> {
  id?: string;
  lessons?: NameId[];
  tags?: NameId[];
}

const EMPTY: VocabTextFields = {
  targetText: '',
  nativeText: '',
  transliteration: '',
  pos: '',
  exampleTarget: '',
  exampleNative: '',
  notes: '',
};

interface Props {
  initial?: VocabFormInitial;
  mode: 'new' | 'edit';
  /**
   * When provided (e.g. the form is hosted inside a dialog), called after a
   * successful save INSTEAD of navigating away — letting the caller close the
   * dialog and refresh its own list while preserving surrounding state.
   */
  onSuccess?: () => void;
  /** When provided, the Cancel button calls this instead of navigating away. */
  onCancel?: () => void;
}

export function VocabForm({ initial, mode, onSuccess, onCancel }: Props) {
  const router = useRouter();
  const params = useParams<{ lang?: string }>();
  const lang = params.lang ?? 'th';
  const [v, setV] = useState<VocabTextFields>({
    ...EMPTY,
    targetText: initial?.targetText ?? '',
    nativeText: initial?.nativeText ?? '',
    transliteration: initial?.transliteration ?? '',
    pos: initial?.pos ?? '',
    exampleTarget: initial?.exampleTarget ?? '',
    exampleNative: initial?.exampleNative ?? '',
    notes: initial?.notes ?? '',
  });
  const [selectedLessonIds, setSelectedLessonIds] = useState<string[]>(
    () => (initial?.lessons ?? []).map((l) => l.id),
  );
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(
    () => (initial?.tags ?? []).map((t) => t.id),
  );
  const [busy, setBusy] = useState(false);
  const [me, setMe] = useState<{ targetLanguage: string; nativeLanguage: string } | null>(
    null,
  );
  const targetLabel = languageName(me?.targetLanguage ?? lang) || 'Target';
  const nativeLabel = localeEnglishName(me?.nativeLanguage) || 'Native';

  useEffect(() => {
    fetch(withBase('/api/me'))
      .then((r) => (r.ok ? r.json() : null))
      .then((mr) => setMe(mr ?? null));
  }, []);

  function on<K extends keyof VocabTextFields>(k: K, val: VocabTextFields[K]) {
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
        lessonIds: selectedLessonIds,
        tagIds: selectedTagIds,
      };
      const url = mode === 'new' ? '/api/vocab' : `/api/vocab/${initial?.id}`;
      const method = mode === 'new' ? 'POST' : 'PATCH';
      const res = await fetch(withBase(url), {
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
      if (onSuccess) {
        // Hosted in a dialog: hand control back rather than navigating away, so
        // the caller can refresh its list and keep its in-progress state.
        onSuccess();
      } else {
        router.push(vocabPath(lang));
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-2xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="targetText">{targetLabel}</Label>
          <SpecialInput
            id="targetText"
            required
            value={v.targetText}
            onChange={(val) => on('targetText', val)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nativeText">{nativeLabel}</Label>
          <Input
            id="nativeText"
            required
            value={v.nativeText}
            onChange={(e) => on('nativeText', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="transliteration">Transliteration (optional)</Label>
          <SpecialInput
            id="transliteration"
            value={v.transliteration}
            onChange={(val) => on('transliteration', val)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pos">Part of speech (optional)</Label>
          <Input id="pos" value={v.pos} onChange={(e) => on('pos', e.target.value)} />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label>Lessons</Label>
          <LessonPicker
            selectedLessonIds={selectedLessonIds}
            onChange={setSelectedLessonIds}
            lang={lang}
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label>Tags</Label>
          <TagPicker selectedTagIds={selectedTagIds} onChange={setSelectedTagIds} />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="exampleTarget">Example sentence ({targetLabel})</Label>
          <Input
            id="exampleTarget"
            value={v.exampleTarget}
            onChange={(e) => on('exampleTarget', e.target.value)}
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="exampleNative">Example sentence ({nativeLabel})</Label>
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
        <Button
          type="button"
          variant="outline"
          onClick={() => (onCancel ? onCancel() : router.push(vocabPath(lang)))}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
