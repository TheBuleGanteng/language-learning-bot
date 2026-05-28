import DOMPurify from 'isomorphic-dompurify';
import { cn } from '@/lib/utils';

const ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'a'];
const ALLOWED_ATTR = ['href', 'target', 'rel'];

interface Props {
  html: string | null | undefined;
  className?: string;
}

/**
 * Render trusted user HTML through DOMPurify with a strict whitelist
 * matching what the RichTextEditor produces. Anything else is stripped.
 */
export function RenderedHtml({ html, className }: Props) {
  if (!html) return null;
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
  });
  return (
    <div
      className={cn('prose prose-sm max-w-none', className)}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
