'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type UserAction = 'remove' | 'disable';
type DataAction = 'delete' | 'reassign';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  user: { id: string; email: string } | null;
  /** Called after a successful action so the list can update the row. */
  onDone: (userId: string, userAction: UserAction) => void;
}

/**
 * Superuser "Remove user" popup (PART 3): two radio groups (account action ×
 * data action) followed by a confirm step.
 */
export function RemoveUserDialog({ open, onOpenChange, user, onDone }: Props) {
  const t = useTranslations('userManagement');
  const tc = useTranslations('common');
  const [step, setStep] = useState<'choose' | 'confirm'>('choose');
  const [userAction, setUserAction] = useState<UserAction>('disable');
  const [dataAction, setDataAction] = useState<DataAction>('reassign');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setStep('choose');
      setUserAction('disable');
      setDataAction('reassign');
      setBusy(false);
    }
  }, [open]);

  async function execute() {
    if (!user) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/users/${user.id}/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userAction, dataAction }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error ?? t('remove.failed'));
      toast.success(t('remove.done'));
      onDone(user.id, userAction);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('remove.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('remove.title')}</DialogTitle>
          <DialogDescription>{user?.email}</DialogDescription>
        </DialogHeader>

        {step === 'choose' ? (
          <div className="space-y-4 py-1">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t('remove.userActionLegend')}</legend>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="user-action"
                  checked={userAction === 'disable'}
                  onChange={() => setUserAction('disable')}
                />
                {t('remove.actionDisable')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="user-action"
                  checked={userAction === 'remove'}
                  onChange={() => setUserAction('remove')}
                />
                {t('remove.actionRemove')}
              </label>
            </fieldset>
            <fieldset className="space-y-2 border-t pt-3">
              <legend className="text-sm font-medium">{t('remove.dataLegend')}</legend>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="data-action"
                  checked={dataAction === 'reassign'}
                  onChange={() => setDataAction('reassign')}
                />
                {t('remove.dataReassign')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="data-action"
                  checked={dataAction === 'delete'}
                  onChange={() => setDataAction('delete')}
                />
                {t('remove.dataDelete')}
              </label>
            </fieldset>
          </div>
        ) : (
          <div className="space-y-2 py-1 text-sm">
            <ul className="list-disc space-y-1 pl-5">
              <li>
                {userAction === 'remove' ? t('remove.actionRemove') : t('remove.actionDisable')}
              </li>
              <li>
                {dataAction === 'delete' ? t('remove.dataDelete') : t('remove.dataReassign')}
              </li>
            </ul>
            <p className="font-medium text-red-600">{t('remove.warning')}</p>
          </div>
        )}

        <DialogFooter>
          {step === 'choose' ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                {tc('cancel')}
              </Button>
              <Button onClick={() => setStep('confirm')} disabled={busy}>
                {t('remove.continue')}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep('choose')} disabled={busy}>
                {t('remove.back')}
              </Button>
              <Button onClick={execute} disabled={busy}>
                {busy ? t('remove.working') : t('remove.confirm')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
