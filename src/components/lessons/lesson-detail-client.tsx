'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
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
import { LessonEditDialog } from './lesson-edit-dialog';
import { VocabTable } from '@/components/vocab/vocab-table';
import { languageName } from '@/lib/languages';
import { flashcardsPath, chatPath } from '@/lib/routes';

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

function formatDate(d: string | null): string {
  if (!d) return '';
  try {
    return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return d;
  }
}

export function LessonDetailClient({ lang, lesson, initialVocabCount }: Props) {
  const [editing, setEditing] = useState(false);
  const [notesCount, setNotesCount] = useState(0);
  const [audioCount, setAudioCount] = useState(0);
  const [linksCount, setLinksCount] = useState(0);
  const [me, setMe] = useState<{ targetLanguage: string; nativeLanguage: string } | null>(
    null,
  );

  useEffect(() => {
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((mr) => setMe(mr ?? null));
  }, []);

  const targetLabel = languageName(me?.targetLanguage ?? lang) || 'Target';

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">{lesson.name}</h1>
          {lesson.topic && (
            <p className="text-muted-foreground italic">{lesson.topic}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {lesson.date ? formatDate(lesson.date) : 'No date'}
            <span className="mx-2">·</span>
            {initialVocabCount} vocab items
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
          Edit lesson details
        </Button>
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
            <VocabTable
              lessonId={lesson.id}
              defaultPageSize="all"
              showSearch
              showPageSize
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <LessonEditDialog
        lessonId={lesson.id}
        initial={{ name: lesson.name, topic: lesson.topic, date: lesson.date }}
        open={editing}
        onOpenChange={setEditing}
      />
    </div>
  );
}
