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
import { PhotosSection } from './photos-section';
import { AudioSection } from './audio-section';
import { LinksSection } from './links-section';
import { LinkCollectionSection } from './link-collection-section';
import { InfoHint } from '@/components/info-hint';
import { InlineEdit } from '@/components/inline-edit';
import { InlineDateEdit } from '@/components/inline-date-edit';
import { RichTextEditModal } from '@/components/rich-text-edit-modal';
import { VocabTable } from '@/components/vocab/vocab-table';
import { VocabForm } from '@/components/vocab/vocab-form';
import { ExtractionFlow } from '@/components/extraction/extraction-flow';
import { DeleteLessonDialog } from '@/components/delete-lesson-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Camera, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { languageName } from '@/lib/languages';
import { flashcardsPath, chatPath, lessonsPath } from '@/lib/routes';
import { withBase } from '@/lib/base-path';
import { canShare, type UserRole } from '@/lib/roles';
import { LessonShareDialog } from './lesson-share-dialog';
import {
  LessonVisibilityBadge,
  type LessonVisibilityStatus,
} from './visibility-badge';

// Item 7: the Audio accordion is temporarily hidden (its data + endpoints are
// intentionally kept intact). Flip this to `true` to re-enable it.
const SHOW_AUDIO_ACCORDION: boolean = false;

interface LessonShape {
  id: string;
  name: string;
  lessonNumber: number | null;
  topic: string | null;
  date: string | null;
  visibility: 'shared' | 'private';
}

interface Props {
  lang: string;
  lesson: LessonShape;
  /** Whether the viewer created this lesson (only the creator may edit sharing). */
  isCreator: boolean;
  initialVocabCount: number;
}

/** Derive the overall lesson status from per-category shared/total counts. */
function deriveStatus(
  cats: Record<string, { total: number; shared: number }>,
  lessonVisibility: 'shared' | 'private',
): LessonVisibilityStatus {
  let total = 0;
  let shared = 0;
  for (const c of Object.values(cats)) {
    total += c.total;
    shared += c.shared;
  }
  if (total === 0) return lessonVisibility === 'shared' ? 'shared' : 'private';
  if (shared === 0) return 'private';
  if (shared >= total) return 'shared';
  return 'partial';
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

export function LessonDetailClient({ lang, lesson, isCreator, initialVocabCount }: Props) {
  const router = useRouter();
  const t = useTranslations('lessonVisibility');
  const tp = useTranslations('photos');
  const [notesCount, setNotesCount] = useState(0);
  const [photosCount, setPhotosCount] = useState(0);
  const [audioCount, setAudioCount] = useState(0);
  const [linksCount, setLinksCount] = useState(0);
  const [dlsAudioCount, setDlsAudioCount] = useState(0);
  const [quizletCount, setQuizletCount] = useState(0);
  const [dlsExercisesCount, setDlsExercisesCount] = useState(0);
  const [showExtraction, setShowExtraction] = useState(false);
  const [manualAddOpen, setManualAddOpen] = useState(false);
  // Bumped after a save (photo or manual) so the VocabTable below remounts and
  // re-fetches its lesson-scoped rows — it manages its own data client-side, so
  // router.refresh() alone (which updates the server count) won't reload it.
  const [vocabRefresh, setVocabRefresh] = useState(0);
  const refreshVocab = () => {
    setVocabRefresh((n) => n + 1);
    router.refresh();
  };
  // Return-to-staging (item 1): the no-key flow sends the user back with
  // ?addVocab=photo after saving a key — reopen the extraction modal here.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('addVocab') === 'photo') setShowExtraction(true);
  }, []);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState<LessonVisibilityStatus | null>(null);
  const [me, setMe] = useState<{
    targetLanguage: string;
    nativeLanguage: string;
    role: UserRole;
  } | null>(null);

  useEffect(() => {
    fetch(withBase('/api/me'))
      .then((r) => (r.ok ? r.json() : null))
      .then((mr) => setMe(mr ?? null));
  }, []);

  // Only a share-capable creator manages sharing; load the current status so the
  // indicator can show Shared / Partially shared / Private.
  const canEditSharing = isCreator && !!me && canShare(me.role);
  useEffect(() => {
    if (!canEditSharing) return;
    let cancelled = false;
    fetch(withBase(`/api/lessons/${lesson.id}/share`))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        setShareStatus(deriveStatus(d.categories, d.lessonVisibility));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canEditSharing, lesson.id]);

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
        {/* Visibility status below the date — clickable for the share-capable
            creator to adjust which material categories are shared. */}
        {canEditSharing && (
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            aria-label={t('editSharing')}
            className="inline-flex items-center gap-1 rounded-md text-xs hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LessonVisibilityBadge
              status={shareStatus ?? (lesson.visibility === 'shared' ? 'shared' : 'private')}
            />
          </button>
        )}
        {isCreator && (
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
        )}
      </header>

      <Accordion
        defaultValue={[
          'notes',
          'photos',
          'dls_audio',
          'dls_exercises',
          'quizlet',
          'links',
          'practice',
          'vocab',
        ]}
        className="space-y-3"
      >
        <AccordionItem value="notes" className="border rounded-md overflow-hidden">
          <AccordionTrigger>
            <span className="text-sm font-semibold">Notes ({notesCount})</span>
          </AccordionTrigger>
          <AccordionContent>
            <NotesSection lessonId={lesson.id} onCountChange={setNotesCount} canEdit={isCreator} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="photos" className="border rounded-md overflow-hidden">
          <AccordionTrigger>
            <span className="text-sm font-semibold">
              {tp('heading')} ({photosCount})
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <PhotosSection lessonId={lesson.id} onCountChange={setPhotosCount} canEdit={isCreator} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="dls_audio" className="border rounded-md overflow-hidden">
          <AccordionTrigger>
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              DLS audio ({dlsAudioCount})
              <InfoHint text="A Duke Language School (DLS) login is required." />
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <LinkCollectionSection
              lessonId={lesson.id}
              category="dls_audio"
              onCountChange={setDlsAudioCount}
              canEdit={isCreator}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="dls_exercises" className="border rounded-md overflow-hidden">
          <AccordionTrigger>
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              DLS exercises ({dlsExercisesCount})
              <InfoHint text="A Duke Language School (DLS) login is required." />
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <LinkCollectionSection
              lessonId={lesson.id}
              category="dls_exercises"
              onCountChange={setDlsExercisesCount}
              canEdit={isCreator}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="quizlet" className="border rounded-md overflow-hidden">
          <AccordionTrigger>
            <span className="text-sm font-semibold">Quizlet ({quizletCount})</span>
          </AccordionTrigger>
          <AccordionContent>
            <LinkCollectionSection
              lessonId={lesson.id}
              category="quizlet"
              onCountChange={setQuizletCount}
              canEdit={isCreator}
            />
          </AccordionContent>
        </AccordionItem>

        {/* Item 7: Audio accordion hidden (data + endpoints intact) — toggle
            SHOW_AUDIO_ACCORDION to re-enable. */}
        {SHOW_AUDIO_ACCORDION && (
          <AccordionItem value="audio" className="border rounded-md overflow-hidden">
            <AccordionTrigger>
              <span className="text-sm font-semibold">Audio ({audioCount})</span>
            </AccordionTrigger>
            <AccordionContent>
              <AudioSection lessonId={lesson.id} onCountChange={setAudioCount} canEdit={isCreator} />
            </AccordionContent>
          </AccordionItem>
        )}

        <AccordionItem value="links" className="border rounded-md overflow-hidden">
          <AccordionTrigger>
            <span className="text-sm font-semibold">Useful Links ({linksCount})</span>
          </AccordionTrigger>
          <AccordionContent>
            <LinksSection lessonId={lesson.id} onCountChange={setLinksCount} canEdit={isCreator} />
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
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setManualAddOpen(true)}
                  className="gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add vocab manually
                </Button>
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
                key={vocabRefresh}
                lessonId={lesson.id}
                defaultPageSize="all"
                showSearch
                showPageSize
                enableBulkSelect
                showEditTagsLessons
                onMutated={refreshVocab}
              />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <ExtractionFlow
        open={showExtraction}
        onOpenChange={setShowExtraction}
        defaultLessonId={lesson.id}
        onSaved={refreshVocab}
      />

      {/* Manual vocab entry scoped to this lesson: reuses the shared VocabForm
          (created_by = current user, visibility = private), pre-filled with this
          lesson (still editable / removable inside the form). */}
      <Dialog open={manualAddOpen} onOpenChange={setManualAddOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add vocab to {lesson.name}</DialogTitle>
            <DialogDescription>
              The lesson is pre-filled below — adjust the lessons or tags as needed.
            </DialogDescription>
          </DialogHeader>
          <VocabForm
            mode="new"
            initial={{ lessons: [{ id: lesson.id, name: lesson.name }] }}
            onSuccess={() => {
              setManualAddOpen(false);
              refreshVocab();
            }}
            onCancel={() => setManualAddOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <DeleteLessonDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        lessonId={lesson.id}
        lessonName={lesson.name}
        onDeleted={() => router.push(lessonsPath(lang))}
      />

      {canEditSharing && (
        <LessonShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          lessonId={lesson.id}
          onSaved={() => {
            // Refresh the status badge + any visibility-filtered sections.
            fetch(withBase(`/api/lessons/${lesson.id}/share`))
              .then((r) => (r.ok ? r.json() : null))
              .then((d) => d && setShareStatus(deriveStatus(d.categories, d.lessonVisibility)))
              .catch(() => {});
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
