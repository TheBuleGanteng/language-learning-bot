'use client';

import type { ReactNode } from 'react';
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
  /** Human label for the gated feature, e.g. "Photo extraction". */
  featureLabel: string;
  /**
   * The provider whose key is needed ('anthropic' | 'openai' | 'google'). Sent
   * as `needKey` so Settings only returns the user after THAT key is saved.
   */
  needKeyProvider?: string;
  /** Settings anchor to deep-link to. Defaults to the API keys section. */
  settingsAnchor?: string;
  /** In-app path to return to after the key is saved. */
  returnTo?: string;
  /** Optional overrides for the default copy. */
  title?: string;
  description?: ReactNode;
}

/**
 * Shared no-key flow (item 1): shown when a key-gated action is attempted but no
 * usable key (personal OR eligible global) resolves. Instead of a raw error, it
 * notifies, deep-links to the right Settings section carrying `returnTo` +
 * `needKey`, and Settings returns the user once the key is saved.
 */
export function NoKeyDialog({
  open,
  onOpenChange,
  featureLabel,
  needKeyProvider,
  settingsAnchor = '#api-keys',
  returnTo,
  title,
  description,
}: Props) {
  const router = useRouter();
  let settingsUrl = `/settings${settingsAnchor}`;
  if (returnTo) {
    const qp = new URLSearchParams({ returnTo });
    if (needKeyProvider) qp.set('needKey', needKeyProvider);
    settingsUrl = `/settings?${qp.toString()}${settingsAnchor}`;
  }
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title ?? `${featureLabel} needs an API key`}</AlertDialogTitle>
          <AlertDialogDescription>
            {description ??
              `${featureLabel} needs an API key. Add one in Settings to continue.`}
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
