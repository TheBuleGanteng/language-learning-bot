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
import { withBase } from '@/lib/base-path';

type Role = 'regular' | 'admin' | 'superuser';
const ROLES: Role[] = ['superuser', 'admin', 'regular'];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  user: { id: string; email: string; role: Role } | null;
  onUpdated: (id: string, role: Role) => void;
}

/** Update-role popup (PART 1): radio buttons for superuser / admin / regular. */
export function UpdateRoleDialog({ open, onOpenChange, user, onUpdated }: Props) {
  const t = useTranslations('userManagement');
  const tc = useTranslations('common');
  const [role, setRole] = useState<Role>('regular');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && user) setRole(user.role);
  }, [open, user]);

  async function save() {
    if (!user) return;
    setSaving(true);
    try {
      const res = await fetch(withBase(`/api/users/${user.id}/role`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t('roles.updateFailed'));
      toast.success(t('roles.updated'));
      onUpdated(user.id, d.role as Role);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('roles.updateFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('users.updateRole')}</DialogTitle>
          <DialogDescription>{user?.email}</DialogDescription>
        </DialogHeader>
        <fieldset className="space-y-2 py-1">
          {ROLES.map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="update-role"
                checked={role === r}
                onChange={() => setRole(r)}
              />
              {r}
            </label>
          ))}
        </fieldset>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {tc('cancel')}
          </Button>
          <Button onClick={save} disabled={saving || role === user?.role}>
            {saving ? tc('saving') : tc('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
