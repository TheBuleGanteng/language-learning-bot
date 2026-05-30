'use client';

import { SessionProvider } from 'next-auth/react';
import { Toaster } from '@/components/ui/sonner';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider basePath={`${basePath}/api/auth`}>
      {children}
      <Toaster richColors position="top-right" />
    </SessionProvider>
  );
}