import { Skeleton } from '@/components/ui/skeleton';

// Matches the wrapper used by the real lesson detail page
// (src/app/(app)/language/[lang]/lessons/[lessonId]/page.tsx) so there's no
// layout jump when the streamed content swaps in.
export default function LessonDetailLoading() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Back link placeholder */}
      <Skeleton className="h-5 w-32" />

      {/* Header block: name + topic + meta */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-1/2" />     {/* lesson name */}
        <Skeleton className="h-5 w-2/3" />      {/* topic */}
        <div className="flex gap-4">
          <Skeleton className="h-4 w-24" />     {/* date */}
          <Skeleton className="h-4 w-28" />     {/* vocab count */}
        </div>
      </div>

      {/* Accordion sections — 5 skeleton blocks */}
      <div className="space-y-3 pt-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}
