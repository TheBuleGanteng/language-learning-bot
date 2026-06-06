import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { lessons, lessonLinks } from '@/db/schema';
import { auth } from '@/lib/auth';
import { lessonVisibleSql, lessonLinkVisibleSql } from '@/lib/visibility';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The per-lesson link collections (item 4–7). 'general' is the original Useful
// Links accordion; the rest are dedicated resource sections.
const LINK_CATEGORIES = ['general', 'dls_audio', 'quizlet', 'dls_exercises'] as const;
type LinkCategory = (typeof LINK_CATEGORIES)[number];
function asCategory(v: string | null | undefined): LinkCategory | null {
  return v && (LINK_CATEGORIES as readonly string[]).includes(v) ? (v as LinkCategory) : null;
}

/** Extract a YouTube video ID from common URL shapes, or null if it isn't one. */
function parseYouTube(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1).split('/')[0];
      return /^[A-Za-z0-9_-]{6,}$/.test(id) ? id : null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (u.pathname === '/watch') {
        const id = u.searchParams.get('v');
        return id && /^[A-Za-z0-9_-]{6,}$/.test(id) ? id : null;
      }
      if (u.pathname.startsWith('/shorts/') || u.pathname.startsWith('/embed/')) {
        const id = u.pathname.split('/')[2];
        return id && /^[A-Za-z0-9_-]{6,}$/.test(id) ? id : null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Best-effort YouTube oEmbed title fetch — non-fatal. */
async function fetchYouTubeTitle(url: string): Promise<string | null> {
  try {
    const oembed = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const res = await fetch(oembed, { signal: AbortSignal.timeout(3500) });
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string };
    return typeof data.title === 'string' ? data.title : null;
  } catch {
    return null;
  }
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ lessonId: string }> },
) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { lessonId } = await ctx.params;
  if (!UUID_RE.test(lessonId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Optional ?category= filter — each lesson-detail section fetches its own
  // collection. Absent → all categories (back-compat).
  const category = asCategory(new URL(req.url).searchParams.get('category'));

  // Visibility-aware: lesson must be visible (own or shared); only links the
  // viewer may see are returned (own, or shared).
  const [lesson] = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(and(eq(lessons.id, lessonId), lessonVisibleSql(userId)))
    .limit(1);
  if (!lesson) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const rows = await db
    .select()
    .from(lessonLinks)
    .where(
      and(
        eq(lessonLinks.lessonId, lessonId),
        lessonLinkVisibleSql(userId),
        category ? eq(lessonLinks.category, category) : undefined,
      ),
    )
    .orderBy(asc(lessonLinks.position), asc(lessonLinks.createdAt));

  // Only the owner may edit/delete a shared link (Feature A rule).
  const out = rows.map((r) => ({ ...r, canEdit: r.userId === userId }));
  return NextResponse.json({ links: out });
}

const createSchema = z.object({
  // Require an http(s) scheme — zod's .url() alone still accepts javascript:/data:
  // URLs, which would be an XSS vector once rendered into an <a href>.
  url: z
    .string()
    .url()
    .max(2000)
    .refine((u) => /^https?:\/\//i.test(u.trim()), {
      message: 'URL must start with http:// or https://',
    }),
  title: z.string().max(300).optional(),
  notes: z.string().max(2000).optional(),
  category: z.enum(LINK_CATEGORIES).optional(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ lessonId: string }> },
) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { lessonId } = await ctx.params;
  if (!UUID_RE.test(lessonId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const [lesson] = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(and(eq(lessons.id, lessonId), eq(lessons.userId, userId)))
    .limit(1);
  if (!lesson) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const d = parsed.data;

  const videoId = parseYouTube(d.url);
  let title = d.title?.trim() || null;
  if (videoId && !title) {
    title = await fetchYouTubeTitle(d.url);
  }
  if (!title) title = d.url;

  const [row] = await db
    .insert(lessonLinks)
    .values({
      userId,
      lessonId,
      url: d.url,
      title,
      notes: d.notes ?? null,
      kind: videoId ? 'youtube' : 'generic',
      youtubeVideoId: videoId,
      category: d.category ?? 'general',
    })
    .returning();

  return NextResponse.json(row, { status: 201 });
}
