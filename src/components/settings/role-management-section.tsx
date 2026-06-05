'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { UserPlus } from 'lucide-react';
import { AddUserDialog } from './add-user-dialog';
import { RemoveUserDialog } from './remove-user-dialog';
import { withBase } from '@/lib/base-path';

type Role = 'regular' | 'admin' | 'superuser';
interface UserRow {
  id: string;
  email: string;
  displayName: string | null;
  role: Role;
  disabled: boolean;
}

export function RoleManagementSection() {
  const t = useTranslations('userManagement');
  const [me, setMe] = useState<{ id: string; role: Role } | null>(null);
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<UserRow | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);

  useEffect(() => {
    fetch(withBase('/api/me'))
      .then((r) => r.json())
      .then((d) => setMe({ id: d.id, role: d.role }))
      .catch(() => {});
  }, []);

  const isSuperuser = me?.role === 'superuser';

  const search = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        withBase(`/api/users${query ? `?q=${encodeURIComponent(query)}` : ''}`),
      );
      if (!res.ok) throw new Error();
      const d = await res.json();
      setRows(d.users ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isSuperuser) return;
    const handle = setTimeout(() => search(q.trim()), 400);
    return () => clearTimeout(handle);
  }, [q, isSuperuser, search]);

  if (!isSuperuser) return null;

  async function changeRole(id: string, role: Role) {
    try {
      const res = await fetch(withBase(`/api/users/${id}/role`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t('roles.updateFailed'));
      setRows((prev) => (prev ? prev.map((r) => (r.id === id ? { ...r, role: d.role } : r)) : prev));
      toast.success(t('roles.updated'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('roles.updateFailed'));
    }
  }

  async function triggerReset(id: string) {
    setResettingId(id);
    try {
      const res = await fetch(withBase(`/api/users/${id}/reset-password`), { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t('users.resetFailed'));
      toast.success(t('users.resetSent'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('users.resetFailed'));
    } finally {
      setResettingId(null);
    }
  }

  function onRemoved(userId: string, userAction: 'remove' | 'disable') {
    setRows((prev) => {
      if (!prev) return prev;
      if (userAction === 'remove') return prev.filter((r) => r.id !== userId);
      return prev.map((r) => (r.id === userId ? { ...r, disabled: true } : r));
    });
  }

  const empty = !rows || rows.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('desc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Input
          placeholder={t('search')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : empty ? (
          <p className="text-sm text-muted-foreground">{t('noUsers')}</p>
        ) : (
          <>
            {/* Sub-section: Manage user roles */}
            <section className="space-y-3">
              <h3 className="text-sm font-medium">{t('roles.heading')}</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('roles.colDisplayName')}</TableHead>
                      <TableHead>{t('roles.colEmail')}</TableHead>
                      <TableHead>{t('roles.colCurrentRole')}</TableHead>
                      <TableHead>{t('roles.colChangeRole')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows!.map((r) => {
                      const self = r.id === me?.id;
                      return (
                        <TableRow key={r.id}>
                          <TableCell>{r.displayName ?? '—'}</TableCell>
                          <TableCell className="break-all">{r.email}</TableCell>
                          <TableCell>{r.role}</TableCell>
                          <TableCell>
                            {self ? (
                              <span
                                title={t('roles.cannotChangeOwn')}
                                className="text-xs text-muted-foreground"
                              >
                                {t('roles.you', { role: r.role })}
                              </span>
                            ) : (
                              <Select
                                value={r.role}
                                onValueChange={(v) => v && changeRole(r.id, v as Role)}
                              >
                                <SelectTrigger className="w-36">
                                  <SelectValue>{r.role}</SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="regular">regular</SelectItem>
                                  <SelectItem value="admin">admin</SelectItem>
                                  <SelectItem value="superuser">superuser</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </section>

            {/* Sub-section: Manage users */}
            <section className="space-y-3 border-t pt-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium">{t('users.heading')}</h3>
                <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
                  <UserPlus className="h-3.5 w-3.5" />
                  {t('users.addUser')}
                </Button>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('users.colEmail')}</TableHead>
                      <TableHead>{t('users.colRole')}</TableHead>
                      <TableHead>{t('users.colStatus')}</TableHead>
                      <TableHead className="text-right">{t('users.colActions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows!.map((r) => {
                      const self = r.id === me?.id;
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="break-all">{r.email}</TableCell>
                          <TableCell>{r.role}</TableCell>
                          <TableCell>
                            <span
                              className={
                                r.disabled ? 'text-red-600' : 'text-green-600 dark:text-green-500'
                              }
                            >
                              {r.disabled ? t('users.statusDisabled') : t('users.statusActive')}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="xs"
                                variant="outline"
                                disabled={resettingId === r.id}
                                onClick={() => triggerReset(r.id)}
                              >
                                {t('users.resetPassword')}
                              </Button>
                              <Button
                                size="xs"
                                variant="ghost"
                                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                                disabled={self}
                                title={self ? t('users.you') : undefined}
                                onClick={() => setRemoveTarget(r)}
                              >
                                {t('users.remove')}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </section>
          </>
        )}
      </CardContent>

      <AddUserDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={() => search(q.trim())}
      />
      <RemoveUserDialog
        open={!!removeTarget}
        onOpenChange={(o) => !o && setRemoveTarget(null)}
        user={removeTarget}
        onDone={onRemoved}
      />
    </Card>
  );
}
