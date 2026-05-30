'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function AuthErrorContent() {
  const params = useSearchParams();
  const error = params.get('error') || 'unknown';

  const messages: Record<string, string> = {
    CredentialsSignin: 'Invalid email or password.',
    Verification: 'The verification link is invalid or has expired.',
    Configuration: 'There is a problem with the server configuration.',
    AccessDenied: 'Access denied.',
    unknown: 'An unknown authentication error occurred.',
  };

  const message = messages[error] || messages.unknown;

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6 text-center">
        <h1 className="text-2xl font-semibold">Authentication error</h1>
        <p className="text-muted-foreground">{message}</p>
        <Link href="/login" className="inline-block text-primary underline">
          Back to login
        </Link>
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={null}>
      <AuthErrorContent />
    </Suspense>
  );
}