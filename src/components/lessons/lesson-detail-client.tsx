'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { GraduationCap, MessagesSquare } from 'lucide-react';
import { NotesSection } from './notes-section';
import { AudioSection } from './audio-section';
import { LinksSection } from './links-section';
import { InlineEdit } from '@/components/inline-edit';
import { InlineDateEdit } from '@/components/inline-date-edit';
import { RichTextEditModal } from '@/components/rich-text-edit-modal';
import { VocabTable } from '@/components/vocab/vocab-table';
import { ExtractionFlow } from '@/components/extraction/extraction-flow';
import { DeleteLessonDialog } from '@/components/delete-lesson-dialog';
import { Camera, Trash2 } from 'lucide-react';
import { languageName } from '@/lib/languages';
import { flashcardsPath, chatPath, lessonsPath } from '@/lib/routes';
import { withBase } from '@/lib/base-path';

interface LessonShape {
  id: string;
  name: string;
  lessonNumber: number | null;
  topic: string | null;
  date: string | null;
}

interface Props {
  lang: string;
  lesson: LessonShape;
  initialVocabCount: number;
}

async function patchLesson(lessonId: string, body: Record<string, unknown>) {
  const res = await fetch(withBase(`/api/lessons/${lessonId}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const d = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(d.error ?? 'Save failed');
  }
}

/** YYYY-MM-DD in local time, no UTC drift. */
function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function LessonDetailClient({ lang, lesson, initialVocabCount }: Props) {
  const router = useRouter();
  const [notesCount, setNotesCount] = useState(0);
  const [audioCount, setAudioCount] = useState(0);
  const [linksCount, setLinksCount] = useState(0);
  const [showExtraction, setShowExtraction] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [me, setMe] = useState<{ targetLanguage: string; nativeLanguage: string } | null>(
    null,
  );

  useEffect(() => {
    fetch(withBase('/api/me'))
      .then((r) => (r.ok ? r.json() : null))
      .then((mr) => setMe(mr ?? null));
  }, []);

  const targetLabel = languageName(me?.targetLanguage ?? lang) || 'Target';

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <InlineEdit
          value={lesson.name}
          ariaLabel="Lesson name"
          onSave={async (next) => {
            const trimmed = next.trim();
            if (!trimmed) throw new Error('Name is required');
            await patchLesson(lesson.id, { name: trimmed });
            router.refresh();
          }}
          className="text-2xl font-bold"
        />
        <RichTextEditModal
          value={lesson.topic ?? ''}
          emptyPlaceholder="No topic — click to add"
          title="Edit lesson topic"
          onSave={async (newHtml) => {
            await patchLesson(lesson.id, { topic: newHtml || null });
            router.refresh();
          }}
          className="text-muted-foreground"
        />
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <InlineDateEdit
            value={lesson.date ? new Date(`${lesson.date}T00:00:00`) : null}
            onSave={async (next) => {
              await patchLesson(lesson.id, {
                date: next ? toLocalDateString(next) : null,
              });
              router.refresh();
            }}
          />
          <span>·</span>
          <span>{initialVocabCount} vocab items</span>
        </div>
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeleteOpen(true)}
            className="gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete lesson
          </Button>
        </div>
      </header>

      <Accordion
        defaultValue={['notes', 'audio', 'links', 'practice', 'vocab']}
        className="space-y-3"
      >
        <AccordionItem value="notes" className="border rounded-md overflow-hidden">
          <AccordionTrigger>
            <span className="text-sm font-semibold">Notes ({notesCount})</span>
          </AccordionTrigger>
          <AccordionContent>
            <NotesSection lessonId={lesson.id} onCountChange={setNotesCount} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="audio" className="border rounded-md overflow-hidden">
          <AccordionTrigger>
            <span className="text-sm font-semibold">Audio ({audioCount})</span>
          </AccordionTrigger>
          <AccordionContent>
            <AudioSection lessonId={lesson.id} onCountChange={setAudioCount} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="links" className="border rounded-md overflow-hidden">
          <AccordionTrigger>
            <span className="text-sm font-semibold">Useful Links ({linksCount})</span>
          </AccordionTrigger>
          <AccordionContent>
            <LinksSection lessonId={lesson.id} onCountChange={setLinksCount} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="practice" className="border rounded-md overflow-hidden">
          <AccordionTrigger>
            <span className="text-sm font-semibold">Practice</span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <GraduationCap className="h-5 w-5" />
                    Flashcards
                  </CardTitle>
                  <CardDescription>
                    Review this lesson&apos;s vocab with spaced-repetition flashcards.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild>
                    <Link href={flashcardsPath(lang, lesson.id)}>Open</Link>
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessagesSquare className="h-5 w-5" />
                    AI Chat
                  </CardTitle>
                  <CardDescription>
                    Practice conversation with an AI tutor focused on this lesson.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild>
                    <Link href={chatPath(lang, lesson.id)}>Open</Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="vocab" className="border rounded-md overflow-hidden">
          <AccordionTrigger>
            <span className="text-sm font-semibold">
              {targetLabel} ({initialVocabCount})
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowExtraction(true)}
                  className="gap-1.5"
                >
                  <Camera className="h-3.5 w-3.5" />
                  Add vocab from photo
                </Button>
              </div>
              <VocabTable
                lessonId={lesson.id}
                defaultPageSize="all"
                showSearch
                showPageSize
                enableBulkSelect
              />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <ExtractionFlow
        open={showExtraction}
        onOpenChange={setShowExtraction}
        defaultLessonId={lesson.id}
        onSaved={() => router.refresh()}
      />

      <DeleteLessonDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        lessonId={lesson.id}
        lessonName={lesson.name}
        onDeleted={() => router.push(lessonsPath(lang))}
      />
    </div>
  );
}
