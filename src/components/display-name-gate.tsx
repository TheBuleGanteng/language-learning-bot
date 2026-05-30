'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface Props {
  children: React.ReactNode;
  /** The current user's display name; null/empty means "not set". */
  userDisplayName: string | null;
}

/**
 * Wraps a share/unshare trigger. If the user has no display name, intercepts
 * the click and shows a modal directing them to Settings instead of letting the
 * share action proceed. When a display name is set, renders children untouched.
 */
export function DisplayNameGate({ children, userDisplayName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const gated = !userDisplayName || userDisplayName.trim() === '';

  if (!gated) return <>{children}</>;

  return (
    <>
      {/* display:contents so the wrapper doesn't affect layout; capture the
          click before it reaches the trigger so the share action never fires. */}
      <span
        className="contents"
        onClickCapture={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        {children}
      </span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Display name required</DialogTitle>
            <DialogDescription>
              You need a display name before sharing content.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setOpen(false);
                router.push('/settings#display-name');
              }}
            >
              Go to Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
