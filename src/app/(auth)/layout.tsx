import Link from 'next/link';
import { getLocale } from 'next-intl/server';
import { LanguageSelector } from '@/components/language-selector';
import { LoginWallpaper } from '@/components/login-wallpaper';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <div className="relative min-h-svh flex flex-col items-center p-6">
      <LoginWallpaper />
      {/* Pre-auth language selector (B4) — sets the NEXT_LOCALE cookie so the
          auth UI (and a new account's base language) follow the chosen locale. */}
      <div className="flex w-full max-w-md justify-end">
        <LanguageSelector currentLocale={locale} authenticated={false} />
      </div>
      <div className="flex flex-1 flex-col justify-center w-full max-w-md">
        <Link href="/" className="block text-center mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Kaojai</h1>
        </Link>
        {children}
      </div>
    </div>
  );
}
