import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { isLanguageCode, normalizeLanguageCode } from '@/lib/languages';

const LEGACY_VOCAB_RE = /^\/vocab(\/.*)?$/;
const LANG_RE = /^\/language\/([^/]+)(\/.*)?$/;

/**
 * Auth-aware proxy (formerly "middleware" — renamed in Next 16).
 *
 *  - Redirects legacy /vocab[...] paths to /language/{userLang}/vocab[...]
 *  - If the user visits /language/{wrongLang}/..., redirects to their actual
 *    target language with a ?notice=wrong-lang query the destination shows
 *    as a toast.
 *  - Unauthenticated requests fall through; the (app) layout handles auth
 *    redirects.
 */
export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  const sessionUser = req.auth?.user as
    | { id?: string; targetLanguage?: string }
    | undefined;
  const targetLang = sessionUser?.targetLanguage
    ? normalizeLanguageCode(sessionUser.targetLanguage)
    : null;

  const legacyMatch = pathname.match(LEGACY_VOCAB_RE);
  if (legacyMatch) {
    if (!targetLang) {
      // Unauthenticated — let the page's auth-redirect handle it
      return NextResponse.next();
    }
    const url = req.nextUrl.clone();
    url.pathname = `/language/${targetLang}/vocab${legacyMatch[1] ?? ''}`;
    return NextResponse.redirect(url);
  }

  const langMatch = pathname.match(LANG_RE);
  if (langMatch && targetLang) {
    const requestedLang = langMatch[1];
    if (!isLanguageCode(requestedLang) || requestedLang !== targetLang) {
      const url = req.nextUrl.clone();
      // Drop the user back on their vocab page with a notice flag
      url.pathname = `/language/${targetLang}/vocab`;
      url.search = '';
      url.searchParams.set('notice', 'wrong-lang');
      return NextResponse.redirect(url);
    }
  }

  // Pass-through; preserve query string
  void search;
  return NextResponse.next();
});

export const config = {
  matcher: ['/vocab', '/vocab/:path*', '/language/:path*'],
};
