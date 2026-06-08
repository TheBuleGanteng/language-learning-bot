'use client';

import { SessionProvider } from 'next-auth/react';
import { Toaster } from '@/components/ui/sonner';
import { BulkGenToast } from '@/components/bulk-gen-toast';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider basePath={`${basePath}/api/auth`}>
      {children}
      <Toaster richColors closeButton position="top-right" />
      {/* App-wide bulk image-generation progress toast (Part 6) — survives
          client-side navigation and reloads. */}
      <BulkGenToast />
    </SessionProvider>
  );
}