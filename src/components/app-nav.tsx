'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ChevronDown, GraduationCap, MessagesSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { vocabPath, lessonsPath, decksPath } from '@/lib/routes';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Props {
  lang: string;
  className?: string;
}

export function AppNav({ lang, className }: Props) {
  const pathname = usePathname();
  const t = useTranslations('nav');
  const langPrefix = `/language/${lang}`;
  const isActive = (target: string) => pathname.startsWith(target);

  const items = [
    { label: t('vocab'), href: vocabPath(lang), match: `${langPrefix}/vocab` },
    { label: t('lessons'), href: lessonsPath(lang), match: `${langPrefix}/lessons` },
  ];

  const learnActive = isActive(`${langPrefix}/flashcards`);
  const navItemClass = (active: boolean) =>
    cn(
      'rounded-md px-3 py-1.5 text-sm transition-colors',
      active
        ? 'bg-muted text-foreground'
        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
    );

  return (
    <nav className={cn('flex items-center gap-1', className)}>
      {items.map((i) => (
        <Link key={i.label} href={i.href} className={navItemClass(isActive(i.match))}>
          {i.label}
        </Link>
      ))}

      {/* Learn dropdown — language-aware; only rendered inside the authed
          (app) layout, which always supplies the user's target language. */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button type="button" className={cn(navItemClass(learnActive), 'inline-flex items-center gap-1')}>
              {t('learn')}
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          }
        />
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            render={
              <Link href={decksPath(lang)}>
                <GraduationCap className="mr-2 h-4 w-4" />
                {t('flashcards')}
              </Link>
            }
          />
          {/* Sends the user to the deck list; each deck's "Practice" button
              opens the Kruu Bingo avatar session (§12). */}
          <DropdownMenuItem
            render={
              <Link href={decksPath(lang)}>
                <MessagesSquare className="mr-2 h-4 w-4" />
                {t('practice')}
              </Link>
            }
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
