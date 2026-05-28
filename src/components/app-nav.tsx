'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { vocabPath, lessonsPath } from '@/lib/routes';

interface Props {
  lang: string;
}

export function AppNav({ lang }: Props) {
  const pathname = usePathname();
  const langPrefix = `/language/${lang}`;
  const isActive = (target: string) => {
    if (target === '/settings') return pathname === '/settings';
    return pathname.startsWith(target);
  };

  const items = [
    { label: 'Vocab', href: vocabPath(lang), match: `${langPrefix}/vocab` },
    { label: 'Lessons', href: lessonsPath(lang), match: `${langPrefix}/lessons` },
    { label: 'Settings', href: '/settings', match: '/settings' },
  ];

  return (
    <nav className="flex items-center gap-1">
      <Link href={vocabPath(lang)} className="font-semibold mr-4">
        LangBot
      </Link>
      {items.map((i) => (
        <Link
          key={i.label}
          href={i.href}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm transition-colors',
            isActive(i.match)
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
          )}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
