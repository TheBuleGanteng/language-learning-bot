'use client';

import { Suspense, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { withBase } from '@/lib/base-path';

function ResetInner() {
  const router = useRouter();
  const search = useSearchParams();
  const t = useTranslations('auth.reset');
  const token = search.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(withBase('/api/auth/reset-password'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? t('invalidLink'));
        return;
      }
      setDone(true);
      setTimeout(() => router.push('/login'), 1500);
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('invalidTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{t('missingToken')}</p>
          <Button asChild variant="outline" className="w-full mt-4">
            <Link href="/forgot-password">{t('requestNew')}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>
          {t('sessionsNote')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {done ? (
          <p className="text-green-700 dark:text-green-400 text-sm">
            {t('redirecting')}
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">{t('password')}</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground">
                At least 8 characters, with at least one letter and one number.
              </p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? t('submitting') : t('submit')}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetInner />
    </Suspense>
  );
}
