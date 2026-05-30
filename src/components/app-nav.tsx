'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
}

export function AppNav({ lang }: Props) {
  const pathname = usePathname();
  const langPrefix = `/language/${lang}`;
  const isActive = (target: string) => pathname.startsWith(target);

  const items = [
    { label: 'Vocab', href: vocabPath(lang), match: `${langPrefix}/vocab` },
    { label: 'Lessons', href: lessonsPath(lang), match: `${langPrefix}/lessons` },
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
    <nav className="flex items-center gap-1">
      <Link href={vocabPath(lang)} className="font-semibold mr-4">
        LangBot
      </Link>
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
              Learn
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          }
        />
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            render={
              <Link href={decksPath(lang)}>
                <GraduationCap className="mr-2 h-4 w-4" />
                Flashcards
              </Link>
            }
          />
          <DropdownMenuItem disabled title="Coming soon">
            <MessagesSquare className="mr-2 h-4 w-4" />
            AI Conversation
            <span className="ml-2 text-xs text-muted-foreground">Coming soon</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
