'use client';

import { Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

function VerifySentInner() {
  const search = useSearchParams();
  const t = useTranslations('auth.verifySent');
  const email = search.get('email');
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('body', { email: email ?? 'your email' })}</p>
        <p className="text-xs text-muted-foreground">{t('expires')}</p>
        <Button asChild variant="outline" className="w-full">
          <Link href="/login">{t('backToLogin')}</Link>
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
