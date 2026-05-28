'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { lessonPath } from '@/lib/routes';

export function NewLessonButton() {
  const router = useRouter();
  const params = useParams<{ lang: string }>();
  const lang = params.lang;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);

  function reset() {
    setName('');
    setTopic('');
    setDate('');
  }

  async function onCreate() {
    setBusy(true);
    try {
      const res = await fetch('/api/lessons', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          topic: topic.trim() || undefined,
          date: date || undefined,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d?.error ?? 'Create failed');
        return;
      }
      toast.success('Lesson created');
      reset();
      setOpen(false);
      router.push(lessonPath(lang, d.id));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger render={<Button size="sm" />}>New Lesson</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Lesson</DialogTitle>
          <DialogDescription>
            Create a lesson to attach notes, audio, links, and vocab.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="nl-name">Name</Label>
            <Input
              id="nl-name"
              required
              placeholder="e.g. Lesson 34"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nl-topic">Topic (optional)</Label>
            <Input
              id="nl-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nl-date">Date (optional)</Label>
            <Input
              id="nl-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={onCreate} disabled={busy || !name.trim()}>
            {busy ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
