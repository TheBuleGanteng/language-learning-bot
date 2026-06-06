'use client';

import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentLoadingTask } from 'pdfjs-dist';
import { FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  /** Signed (or local) URL to the PDF — same private path the viewer uses. */
  url: string;
  filename: string;
  /** Click → open the full scrollable viewer. */
  onClick: () => void;
  className?: string;
}

type Status = 'loading' | 'ready' | 'error';

// Lazily render the first page of a PDF to a canvas with pdf.js. The library and
// its worker load on demand (client-only) the first time the thumbnail scrolls
// near the viewport, so a lesson with several PDFs doesn't rasterize every first
// page up front. On any failure we fall back to a generic file icon + filename.
export function PdfThumbnail({ url, filename, onClick, className }: Props) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  // Kept mounted across loading → ready so the rendered pixels survive; visually
  // hidden until the render completes.
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [visible, setVisible] = useState(false);

  // Lazy trigger: only begin loading once the thumbnail is near the viewport.
  useEffect(() => {
    const el = buttonRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '400px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    // Destroying the loading task tears down the document + worker transport
    // (PDFDocumentProxy itself has no destroy()).
    let task: PDFDocumentLoadingTask | undefined;
    setStatus('loading');
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        // Worker is bundled by webpack and served under the app base path.
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString();
        task = pdfjs.getDocument({ url });
        const loaded = await task.promise;
        const page = await loaded.getPage(1);
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        // Fit the first page to a small thumbnail width, preserving aspect.
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: 200 / base.width });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, viewport }).promise;
        if (cancelled) return;
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
      task?.destroy();
    };
  }, [visible, url]);

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      title={`Open ${filename}`}
      aria-label={`Open ${filename}`}
      className={cn(
        'relative flex h-44 w-32 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/30 transition-shadow hover:ring-2 hover:ring-primary/50',
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        className={cn('h-full w-full object-contain', status !== 'ready' && 'hidden')}
      />
      {status === 'loading' && (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      )}
      {status === 'error' && (
        <span className="flex flex-col items-center gap-1 px-2 text-center text-muted-foreground">
          <FileText className="h-8 w-8" />
          <span className="line-clamp-2 break-all text-[10px]">{filename}</span>
        </span>
      )}
    </button>
  );
}
