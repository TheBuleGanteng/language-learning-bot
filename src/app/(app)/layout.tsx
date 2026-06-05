import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { getLocale } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { users } from '@/db/schema';
import { AppNav } from '@/components/app-nav';
import { UserMenu } from '@/components/user-menu';
import { MobileMenu } from '@/components/mobile-menu';
import { AppFooter } from '@/components/app-footer';
import { LanguageSelector } from '@/components/language-selector';
import { BatchWatcher } from '@/components/batch-watcher';
import { normalizeLanguageCode } from '@/lib/languages';
import { homePath } from '@/lib/routes';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.email) {
    redirect('/login');
  }
  const userId = (session.user as { id?: string }).id;
  let lang = 'th';
  if (userId) {
    const [row] = await db
      .select({ target: users.targetLanguage })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (row) lang = normalizeLanguageCode(row.target);
  }
  const locale = await getLocale();
  return (
    <div className="min-h-svh flex flex-col">
      {/* Sticky header (§5) — stays visible while scrolling long pages. */}
      <header className="sticky top-0 z-40 w-full border-b bg-background">
        <div className="container mx-auto flex max-w-full items-center justify-between gap-2 px-4 py-3">
          {/* Logo (always visible) + desktop nav (collapses into the mobile
              master menu below md). */}
          <div className="flex min-w-0 items-center gap-1">
            <Link href={homePath()} className="font-semibold shrink-0">
              Kaojai
            </Link>
            <AppNav lang={lang} className="ml-4 hidden md:flex" />
          </div>
          {/* Language selector stays visible (compacts on narrow); the account
              menu is desktop-only and folds into the hamburger on mobile. */}
          <div className="flex shrink-0 items-center gap-1">
            <LanguageSelector currentLocale={locale} authenticated />
            <UserMenu email={session.user.email} className="hidden md:block" />
            <MobileMenu lang={lang} email={session.user.email} className="md:hidden" />
          </div>
        </div>
      </header>
      {/* Scrollable content. Extra bottom padding so the sticky footer never
          covers interactive content on normal pages (§6). */}
      <main className="flex-1 container mx-auto px-4 py-6 pb-16">{children}</main>
      {/* Sticky footer (§6). The immersive chat view renders above it (z-50 on
          mobile) so it never sits on top of the mic/slider controls. */}
      <AppFooter />
      <BatchWatcher userLang={lang} />
    </div>
  );
}
