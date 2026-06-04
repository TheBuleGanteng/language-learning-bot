import { getTranslations } from 'next-intl/server';

/**
 * Slim, always-visible app footer. Sticky to the bottom of the app shell. Only
 * the connective words are localized; the proper nouns stay as-is. All links
 * open in a new tab.
 */
export async function AppFooter() {
  const t = await getTranslations('footer');
  return (
    <footer className="sticky bottom-0 z-40 border-t bg-background">
      <div className="container mx-auto px-4 py-2 text-center text-xs text-muted-foreground">
        <p>
          {t('createdBy')}{' '}
          <a
            href="https://kebayorantechnologies.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            Kebayoran Technologies
          </a>{' '}
          {t('and')}{' '}
          <a
            href="https://mattmcdonnell.net/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            Matthew McDonnell
          </a>
        </p>
        <p>
          <a
            href="https://kebayorantechnologies.com/contact"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            {t('contact')}
          </a>
        </p>
      </div>
    </footer>
  );
}
