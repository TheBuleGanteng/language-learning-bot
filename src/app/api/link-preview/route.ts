import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

// Lightweight Open Graph preview proxy. Used by the Quizlet lesson-link section
// to render a thumbnail (Quizlet pages are public). It fetches the target page
// server-side and extracts og:image / og:title. It stores nothing and always
// returns JSON — on any failure it returns nulls so the client falls back to a
// plain labeled link.

function metaContent(html: string, ...names: string[]): string | null {
  for (const name of names) {
    // property="og:image" content="..."  OR  content="..." property="og:image"
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["']`,
      'i',
    );
    const m = html.match(re);
    if (m?.[1]) return m[1];
    const re2 = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${name}["']`,
      'i',
    );
    const m2 = html.match(re2);
    if (m2?.[1]) return m2[1];
  }
  return null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/gi, '/');
}

export async function GET(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const target = new URL(req.url).searchParams.get('url') ?? '';
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ image: null, title: null });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return NextResponse.json({ image: null, title: null });
  }

  try {
    const res = await fetch(parsed.toString(), {
      signal: AbortSignal.timeout(5000),
      redirect: 'follow',
      headers: {
        // Many sites serve OG tags only to a browser-like UA.
        'User-Agent':
          'Mozilla/5.0 (compatible; LanguageLearningBot/1.0; +link-preview)',
        Accept: 'text/html',
      },
    });
    if (!res.ok) return NextResponse.json({ image: null, title: null });
    // Cap the body we parse — OG tags live in <head>, near the top.
    const html = (await res.text()).slice(0, 200_000);
    const imageRaw = metaContent(html, 'og:image', 'twitter:image', 'twitter:image:src');
    const titleRaw =
      metaContent(html, 'og:title', 'twitter:title') ??
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ??
      null;

    let image: string | null = null;
    if (imageRaw) {
      try {
        // Resolve protocol-relative / relative image URLs against the page.
        image = new URL(decodeEntities(imageRaw), parsed).toString();
      } catch {
        image = null;
      }
    }
    return NextResponse.json({
      image,
      title: titleRaw ? decodeEntities(titleRaw).trim().slice(0, 300) : null,
    });
  } catch {
    return NextResponse.json({ image: null, title: null });
  }
}
