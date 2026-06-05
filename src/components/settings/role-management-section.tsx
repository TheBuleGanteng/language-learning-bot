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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { UserPlus, ChevronDown } from 'lucide-react';
import { AddUserDialog } from './add-user-dialog';
import { RemoveUserDialog } from './remove-user-dialog';
import { UpdateRoleDialog } from './update-role-dialog';
import { GlobalApiKeysSection } from './global-api-keys-section';
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
  const tg = useTranslations('globalApiKeys');
  const [me, setMe] = useState<{ id: string; role: Role } | null>(null);
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<UserRow | null>(null);
  const [roleTarget, setRoleTarget] = useState<UserRow | null>(null);
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

  function onRoleUpdated(id: string, role: Role) {
    setRows((prev) => (prev ? prev.map((r) => (r.id === id ? { ...r, role } : r)) : prev));
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
        <section className="space-y-4">
        <h3 className="text-sm font-medium">{t('users.heading')}</h3>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Input
            placeholder={t('search')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-xs"
          />
          <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
            <UserPlus className="h-3.5 w-3.5" />
            {t('users.addUser')}
          </Button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : empty ? (
          <p className="text-sm text-muted-foreground">{t('noUsers')}</p>
        ) : (
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
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button size="xs" variant="outline" className="gap-1">
                                {t('users.updateUser')}
                                <ChevronDown className="h-3.5 w-3.5" />
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end" className="min-w-44">
                            <DropdownMenuItem
                              disabled={self}
                              onClick={() => setRoleTarget(r)}
                            >
                              {t('users.updateRole')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={resettingId === r.id}
                              onClick={() => triggerReset(r.id)}
                            >
                              {t('users.resetPassword')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              disabled={self}
                              onClick={() => setRemoveTarget(r)}
                            >
                              {t('users.remove')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        </section>

        {/* Subsection: Global API keys (superuser-only; the whole card is gated). */}
        <section className="space-y-4 border-t pt-6">
          <h3 className="text-sm font-medium">{tg('heading')}</h3>
          <GlobalApiKeysSection />
        </section>
      </CardContent>

      <AddUserDialog open={addOpen} onOpenChange={setAddOpen} onAdded={() => search(q.trim())} />
      <UpdateRoleDialog
        open={!!roleTarget}
        onOpenChange={(o) => !o && setRoleTarget(null)}
        user={roleTarget}
        onUpdated={onRoleUpdated}
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
