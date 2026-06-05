'use client';

import { useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface AddedUser {
  id: string;
  email: string;
  role: 'regular' | 'admin' | 'superuser';
  disabled: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAdded: (user: AddedUser) => void;
}

/** Superuser "+ Add user" popup (PART 4): email + temp password, verified instantly. */
export function AddUserDialog({ open, onOpenChange, onAdded }: Props) {
  const t = useTranslations('userManagement');
  const tc = useTranslations('common');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function reset() {
    setEmail('');
    setPassword('');
    setError(null);
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error ?? t('add.failed'));
      toast.success(t('add.created'));
      onAdded(d as AddedUser);
      reset();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('add.failed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (saving) return;
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('add.title')}</DialogTitle>
          <DialogDescription>{t('add.desc')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="add-user-email">{t('add.email')}</Label>
            <Input
              id="add-user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-user-password">{t('add.password')}</Label>
            <Input
              id="add-user-password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">{t('add.passwordHint')}</p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {tc('cancel')}
          </Button>
          <Button onClick={submit} disabled={saving || !email.trim() || !password}>
            {saving ? t('add.creating') : t('add.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
