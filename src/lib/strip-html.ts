/**
 * Strip HTML tags from a string for plain-text display contexts
 * (table cells, summary lines, etc.). NOT a security-grade sanitizer —
 * use {@link "@/components/rendered-html".RenderedHtml} for any HTML
 * that's actually rendered into the DOM.
 */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  // Remove tags and decode the small handful of entities the Tiptap
  // editor commonly emits. Anything else passes through unchanged.
  const stripped = html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return stripped.replace(/\s+/g, ' ').trim();
}
