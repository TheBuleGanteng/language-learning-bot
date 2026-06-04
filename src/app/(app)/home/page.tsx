import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { BookOpen } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { users } from '@/db/schema';
import {
  languageName,
  languageFlagCountry,
  normalizeLanguageCode,
} from '@/lib/languages';
import { decksPath, vocabPath } from '@/lib/routes';
import { FlagIcon } from '@/components/flag-icon';
import { cn } from '@/lib/utils';

/**
 * Home hub (§4) — the main landing page after login. Resolves the user's target
 * language server-side and offers two large tiles: practice (→ decks) and update
 * vocabulary (→ vocab).
 */
export default async function HomePage() {
  const session = await auth();
  if (!session?.user?.email) redirect('/login');

  const userId = (session.user as { id?: string }).id;
  let target = 'th';
  if (userId) {
    const [row] = await db
      .select({ t: users.targetLanguage })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (row) target = normalizeLanguageCode(row.t);
  }
  const targetName = languageName(target);
  const flagCountry = languageFlagCountry(target);
  const t = await getTranslations('home');

  const tileBase =
    'group flex flex-col items-start gap-4 rounded-2xl border bg-card p-6 sm:p-8 shadow-sm ' +
    'transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">{t('welcome')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
        {/* Tile 1 — Practice {target language}. */}
        <Link href={decksPath(target)} className={cn(tileBase)}>
          <span className="flex h-14 w-20 items-center justify-center overflow-hidden rounded-md border bg-background">
            <FlagIcon
              country={flagCountry}
              title={targetName}
              className="h-full w-full object-cover"
            />
          </span>
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">{t('practiceTitle', { language: targetName })}</h2>
            <p className="text-sm text-muted-foreground">{t('practiceSubtitle')}</p>
          </div>
        </Link>

        {/* Tile 2 — Update vocabulary. */}
        <Link href={vocabPath(target)} className={cn(tileBase)}>
          <span className="flex h-14 w-20 items-center justify-center rounded-md border bg-background text-primary">
            <BookOpen className="h-8 w-8" />
          </span>
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">{t('updateTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t('updateSubtitle')}</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
