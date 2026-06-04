'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Languages } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FlagIcon } from '@/components/flag-icon';
import { cn } from '@/lib/utils';
import { withBase } from '@/lib/base-path';
import {
  LOCALE_CATALOG,
  LOCALE_LIST,
  LOCALE_COOKIE,
  normalizeLocale,
  type Locale,
} from '@/lib/locales';

interface Props {
  /** Resolved current base language / UI locale (server-provided). */
  currentLocale: string;
  /** Logged in → also persist to the DB; pre-auth → cookie + refresh only. */
  authenticated: boolean;
}

// Module-scope so the cookie write isn't flagged as mutating outside state
// inside the component body.
function persistLocaleCookie(code: string) {
  document.cookie = `${LOCALE_COOKIE}=${code}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * Base-language / UI-locale selector (B4). Lives in the header (authed) and on
 * the auth pages (pre-auth). Each option shows its native + English name and a
 * mini SVG flag (Traditional Chinese: a neutral glyph, no country flag). The
 * trigger always carries the English word "Language" so an English speaker can
 * find it even when the UI is in another language.
 */
export function LanguageSelector({ currentLocale, authenticated }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const current = normalizeLocale(currentLocale);
  const info = LOCALE_CATALOG[current];
  const triggerLabel =
    current === 'en-US' ? 'Language' : `${info.languageWord} (Language)`;

  async function choose(code: Locale) {
    if (code === current || saving) return;
    setSaving(true);
    // Cookie first, so a refresh re-renders in the new locale even pre-auth.
    persistLocaleCookie(code);
    try {
      if (authenticated) {
        const res = await fetch(withBase('/api/settings'), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nativeLanguage: code }),
        });
        if (!res.ok) throw new Error('Save failed');
      }
      toast.success('Language updated');
      router.refresh();
    } catch {
      toast.error('Could not change language');
    } finally {
      setSaving(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label="Select language"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <span className="flex h-3.5 w-5 items-center justify-center overflow-hidden rounded-[2px]">
              {info.flagCountry ? (
                <FlagIcon country={info.flagCountry} className="h-full w-full object-cover" />
              ) : (
                <Languages className="h-4 w-4" />
              )}
            </span>
            <span className="hidden sm:inline">{triggerLabel}</span>
          </button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-56">
        {LOCALE_LIST.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onClick={() => choose(l.code)}
            className={cn(l.code === current && 'font-medium')}
          >
            <span className="flex h-3.5 w-5 items-center justify-center overflow-hidden rounded-[2px]">
              {l.flagCountry ? (
                <FlagIcon
                  country={l.flagCountry}
                  title={l.englishName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Languages className="h-4 w-4" />
              )}
            </span>
            <span className="flex-1">
              {l.nativeName}{' '}
              <span className="text-muted-foreground">({l.englishName})</span>
            </span>
            {l.code === current && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
