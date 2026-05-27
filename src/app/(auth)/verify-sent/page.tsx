'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

function VerifySentInner() {
  const search = useSearchParams();
  const email = search.get('email');
  return (
    <Card>
      <CardHeader>
        <CardTitle>Check your inbox</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          We sent a verification link to <strong>{email ?? 'your email'}</strong>. Click it to
          activate your account.
        </p>
        <p className="text-xs text-muted-foreground">
          The link expires in 24 hours. Check your spam folder if it doesn&apos;t arrive in a few
          minutes.
        </p>
        <Button asChild variant="outline" className="w-full">
          <Link href="/login">Back to log in</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function VerifySentPage() {
  return (
    <Suspense fallback={null}>
      <VerifySentInner />
    </Suspense>
  );
}
