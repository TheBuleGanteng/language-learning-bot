/**
 * Strip HTML tags from a string for plain-text display contexts
 * (table cells, summary lines, etc.). NOT a security-grade sanitizer —
 * use {@link "@/components/rendered-html".RenderedHtml} for any HTML
 * that's actually rendered into the DOM.
 */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  // Replace block-level closing tags with a space so adjacent paragraphs
  // / list items don't run together when their tags are dropped.
  const spaced = html.replace(/<\/(p|div|li|ul|ol|h[1-6]|br|blockquote)>/gi, ' ');
  const stripped = spaced
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return stripped.replace(/\s+/g, ' ').trim();
}
