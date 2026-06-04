/**
 * Slim, always-visible app footer (§6). Sticky to the bottom of the app shell
 * (the layout makes header sticky-top, main scrollable, footer sticky-bottom).
 * Kept intentionally small (text-xs, minimal padding). All links open in a new
 * tab.
 */
export function AppFooter() {
  return (
    <footer className="sticky bottom-0 z-40 border-t bg-background">
      <div className="container mx-auto px-4 py-2 text-center text-xs text-muted-foreground">
        <p>
          Created by{' '}
          <a
            href="https://kebayorantechnologies.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            Kebayoran Technologies
          </a>{' '}
          and{' '}
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
            Contact
          </a>
        </p>
      </div>
    </footer>
  );
}
