'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import { withBase } from '@/lib/base-path';

type Role = 'regular' | 'admin' | 'superuser';
interface UserRow {
  id: string;
  email: string;
  displayName: string | null;
  role: Role;
}

export function RoleManagementSection() {
  const [me, setMe] = useState<{ id: string; role: Role } | null>(null);
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [loading, setLoading] = useState(false);

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
    const t = setTimeout(() => search(q.trim()), 400);
    return () => clearTimeout(t);
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
      if (!res.ok) throw new Error(d.error ?? 'Failed to change role');
      setRows((prev) => (prev ? prev.map((r) => (r.id === id ? { ...r, role: d.role } : r)) : prev));
      toast.success('Role updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to change role');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manage user roles</CardTitle>
        <CardDescription>
          Admins can share content; superusers can also manage roles.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          placeholder="Search users by email or display name"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : !rows || rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No users found.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Display name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Current role</TableHead>
                <TableHead>Change role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const self = r.id === me?.id;
                return (
                  <TableRow key={r.id}>
                    <TableCell>{r.displayName ?? '—'}</TableCell>
                    <TableCell>{r.email}</TableCell>
                    <TableCell>{r.role}</TableCell>
                    <TableCell>
                      {self ? (
                        <span
                          title="Cannot change your own role"
                          className="text-xs text-muted-foreground"
                        >
                          {r.role} (you)
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
        )}
      </CardContent>
    </Card>
  );
}
