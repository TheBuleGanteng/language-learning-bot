import { getRequestConfig } from 'next-intl/server';
import { resolveLocale } from './locale';
import { DEFAULT_LOCALE } from '@/lib/locales';

// next-intl "without i18n routing" — the active locale is resolved per request
// (B0 order) rather than from a `[locale]` URL segment.
export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  const messages = (await import(`../../messages/${locale}.json`)).default;

  return {
    locale,
    messages,
    // Never crash on a missing/incomplete key (B2) — fall back to the English
    // catalog value if present, otherwise render the key path itself.
    getMessageFallback({ key }) {
      return key;
    },
    onError(error) {
      // Swallow missing-message noise (expected while PART C catalogs fill in);
      // surface anything else.
      if (error.code !== 'MISSING_MESSAGE') {
        console.error(error);
      }
    },
  };
});

export { DEFAULT_LOCALE };
