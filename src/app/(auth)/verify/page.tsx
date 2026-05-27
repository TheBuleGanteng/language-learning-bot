'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

function VerifyInner() {
  const router = useRouter();
  const search = useSearchParams();
  const token = search.get('token');
  const [state, setState] = useState<'pending' | 'ok' | 'error'>('pending');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setState('error');
      setMessage('No verification token in URL.');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/verify', {
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
          setMessage(data?.error ?? 'Verification failed.');
        }
      } catch {
        if (!cancelled) {
          setState('error');
          setMessage('Network error.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email verification</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {state === 'pending' && <p>Verifying…</p>}
        {state === 'ok' && (
          <>
            <p className="text-green-700 dark:text-green-400">
              Your email has been verified. Redirecting you to log in…
            </p>
            <Button asChild>
              <Link href="/login?verified=1">Go to login</Link>
            </Button>
          </>
        )}
        {state === 'error' && (
          <>
            <p className="text-destructive">{message}</p>
            <Button asChild variant="outline">
              <Link href="/signup">Back to sign up</Link>
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
