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
}

/**
 * Shown when the user tries to start a Kruu Bingo session without an OpenAI
 * API key configured (§15b). Dismiss stays on the current page; "Go to
 * Settings" deep-links to the API keys section.
 */
export function NoKeyDialog({ open, onOpenChange }: Props) {
  const router = useRouter();
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
          <AlertDialogAction onClick={() => router.push('/settings#api-keys')}>
            Go to Settings
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
