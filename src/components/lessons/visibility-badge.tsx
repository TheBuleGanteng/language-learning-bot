'use client';

import { useTranslations } from 'next-intl';
import { Globe, Lock, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

export type LessonVisibilityStatus = 'private' | 'partial' | 'shared';

/**
 * Localized lesson visibility indicator (Shared / Partially shared / Private)
 * with a status-colored icon. Shared across the lessons table, the mobile card,
 * and the lesson detail page.
 */
export function LessonVisibilityBadge({
  status,
  className,
}: {
  status: LessonVisibilityStatus;
  className?: string;
}) {
  const t = useTranslations('lessonVisibility');
  const Icon = status === 'shared' ? Globe : status === 'partial' ? Users : Lock;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap',
        status === 'shared' && 'text-green-600 dark:text-green-500',
        status === 'partial' && 'text-amber-600 dark:text-amber-500',
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {t(status)}
    </span>
  );
}
