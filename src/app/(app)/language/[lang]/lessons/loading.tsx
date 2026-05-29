import { Skeleton } from '@/components/ui/skeleton';

// Matches the wrapper used by the lessons index page so navigating back here
// after deleting from the detail page shows a skeleton without a layout jump.
export default function LessonsIndexLoading() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-32" />        {/* "Lessons" title */}
        <Skeleton className="h-9 w-28" />         {/* "New Lesson" button */}
      </div>

      {/* Table skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />      {/* header row */}
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}
