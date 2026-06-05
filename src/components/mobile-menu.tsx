'use client';

import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import {
  Menu,
  GraduationCap,
  MessagesSquare,
  BookOpen,
  Library,
  Settings,
  LogOut,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { withBase } from '@/lib/base-path';
import { vocabPath, lessonsPath, decksPath } from '@/lib/routes';

interface Props {
  lang: string;
  email: string;
  className?: string;
}

/**
 * Mobile "master" menu (PART 1): below `md`, the primary nav links (Vocabulary,
 * Lessons, Learn → Flashcards/Practice) and the account menu (email, Settings,
 * Sign out) collapse into this single hamburger dropdown. The logo and language
 * selector stay outside it. base-ui's Menu handles focus, Escape, outside-tap,
 * and aria; the menu closes on item selection automatically.
 */
export function MobileMenu({ lang, email, className }: Props) {
  const t = useTranslations('nav');
  const tc = useTranslations('common');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={t('menu')}
            className={cn(
              'inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              className,
            )}
          >
            <Menu className="h-5 w-5" />
          </button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuItem render={<Link href={vocabPath(lang)}><BookOpen className="mr-2 h-4 w-4" />{t('vocab')}</Link>} />
        <DropdownMenuItem render={<Link href={lessonsPath(lang)}><Library className="mr-2 h-4 w-4" />{t('lessons')}</Link>} />
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t('learn')}</DropdownMenuLabel>
        <DropdownMenuItem render={<Link href={decksPath(lang)}><GraduationCap className="mr-2 h-4 w-4" />{t('flashcards')}</Link>} />
        <DropdownMenuItem render={<Link href={decksPath(lang)}><MessagesSquare className="mr-2 h-4 w-4" />{t('practice')}</Link>} />
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{email}</DropdownMenuLabel>
        <DropdownMenuItem render={<Link href="/settings"><Settings className="mr-2 h-4 w-4" />{tc('settings')}</Link>} />
        <DropdownMenuItem onClick={() => void signOut({ callbackUrl: withBase('/login') })}>
          <LogOut className="mr-2 h-4 w-4" />
          {tc('signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
