'use client';

import { useRouter } from 'next/navigation';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * In-app path to return to after the OpenAI key is saved (§2). When set, the
   * "Go to Settings" link carries `returnTo` + `needKey=openai` so the settings
   * page sends the user back here once that key is saved.
   */
  returnTo?: string;
}

/**
 * Shown when the user tries to start a Kruu Bingo session without an OpenAI
 * API key configured (§15b). Dismiss stays on the current page; "Go to
 * Settings" deep-links to the API keys section (and returns here after save).
 */
export function NoKeyDialog({ open, onOpenChange, returnTo }: Props) {
  const router = useRouter();
  const settingsUrl = returnTo
    ? `/settings?returnTo=${encodeURIComponent(returnTo)}&needKey=openai#api-keys`
    : '/settings#api-keys';
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>OpenAI API key required</AlertDialogTitle>
          <AlertDialogDescription>
            Kruu Bingo uses OpenAI&apos;s Realtime API. Add your OpenAI API key in
            Settings to get started.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => router.push(settingsUrl)}>
            Go to Settings
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
