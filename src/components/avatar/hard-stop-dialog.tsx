'use client';

import { useRouter } from 'next/navigation';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { decksPath } from '@/lib/routes';

interface Props {
  open: boolean;
  hardStopLimit: number;
  lang: string;
}

/**
 * Shown when the user has hit their monthly AI spend hard stop (§15c).
 * Dismissing navigates back to the deck list; "Go to Settings" deep-links to
 * the AI spend section.
 */
export function HardStopDialog({ open, hardStopLimit, lang }: Props) {
  const router = useRouter();
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && router.push(decksPath(lang))}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Monthly AI spend limit reached</AlertDialogTitle>
          <AlertDialogDescription>
            You&apos;ve reached your monthly AI spend limit of ${hardStopLimit.toFixed(2)}.
            Update your limit in Settings to continue.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={() => router.push('/settings#ai-spend')}>
            Go to Settings
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
