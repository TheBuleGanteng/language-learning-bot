'use client';

import { Suspense, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { withBase } from '@/lib/base-path';

function VerifyInner() {
  const router = useRouter();
  const search = useSearchParams();
  const t = useTranslations('auth.verify');
  const token = search.get('token');
  const [state, setState] = useState<'pending' | 'ok' | 'error'>('pending');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setState('error');
      setMessage(t('noToken'));
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(withBase('/api/auth/verify'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        if (cancelled) return;
        if (res.ok) {
          setState('ok');
          setTimeout(() => router.push('/login?verified=1'), 1500);
        } else {
          const data = await res.json().catch(() => ({}));
          setState('error');
          setMessage(data?.error ?? t('failed'));
        }
      } catch {
        if (!cancelled) {
          setState('error');
          setMessage(t('failed'));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, router, t]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {state === 'pending' && <p>{t('verifying')}</p>}
        {state === 'ok' && (
          <>
            <p className="text-green-700 dark:text-green-400">{t('success')}</p>
            <Button asChild>
              <Link href="/login?verified=1">{t('toLogin')}</Link>
            </Button>
          </>
        )}
        {state === 'error' && (
          <>
            <p className="text-destructive">{message}</p>
            <Button asChild variant="outline">
              <Link href="/signup">{t('backToSignup')}</Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyInner />
    </Suspense>
  );
}
