'use client';

import { NoKeyDialog as BaseNoKeyDialog } from '@/components/no-key-dialog';

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
 * Kruu Bingo's no-key dialog — now a thin wrapper over the shared {@link
 * BaseNoKeyDialog} (item 1), preserving the OpenAI/Realtime copy.
 */
export function NoKeyDialog({ open, onOpenChange, returnTo }: Props) {
  return (
    <BaseNoKeyDialog
      open={open}
      onOpenChange={onOpenChange}
      featureLabel="Kruu Bingo"
      needKeyProvider="openai"
      returnTo={returnTo}
      title="OpenAI API key required"
      description="Kruu Bingo uses OpenAI's Realtime API. Add your OpenAI API key in Settings to get started."
    />
  );
}
