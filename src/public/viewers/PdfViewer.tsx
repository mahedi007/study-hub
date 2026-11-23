import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Minus, Plus } from 'lucide-react';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

function PdfPage({ doc, index, width, zoom }: { doc: PDFDocumentProxy; index: number; width: number; zoom: number }) {
  const holder = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(index < 2);
  const [ratio, setRatio] = useState(1.414);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setVisible(true), { rootMargin: '800px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !width) return;
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    doc.getPage(index + 1).then((page) => {
      if (cancelled || !canvas.current) return;
      const base = page.getViewport({ scale: 1 });
      setRatio(base.height / base.width);
      const cssWidth = width * zoom;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr });
      const c = canvas.current;
      c.width = viewport.width;
      c.height = viewport.height;
      c.style.width = `${cssWidth}px`;
      c.style.height = `${(cssWidth * base.height) / base.width}px`;
      const rt = page.render({ canvasContext: c.getContext('2d')!, viewport });
      task = rt;
      rt.promise.catch(() => undefined);
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [visible, width, zoom, doc, index]);

  return (
    <div ref={holder} className="mx-auto mb-3 bg-white shadow-md" style={{ width: width * zoom, minHeight: visible ? undefined : width * zoom * ratio }}>
      <canvas ref={canvas} className="block" />
    </div>
  );
}

export default function PdfViewer({ url }: { url: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState('');
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let destroyed = false;
    const task = pdfjs.getDocument({ url, disableAutoFetch: true, rangeChunkSize: 262144 });
    task.promise.then((d) => !destroyed && setDoc(d)).catch((e) => setError(String(e?.message ?? e)));
    return () => {
      destroyed = true;
      task.destroy();
    };
  }, [url]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.min(el.clientWidth - 16, 1000)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="relative">
      <div className="sticky top-2 z-10 mb-2 flex justify-end">
        <div className="flex items-center gap-1 rounded-full px-2 py-1 text-sm" style={{ background: 'var(--tp-surface)', color: 'var(--tp-text)', border: '1.5px solid var(--tp-ink)', boxShadow: '2px 2px 0 var(--tp-ink)' }}>
          <button className="rounded-full p-1 hover:opacity-70" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} aria-label="Zoom out">
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <button className="rounded-full p-1 hover:opacity-70" onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))} aria-label="Zoom in">
            <Plus className="h-4 w-4" />
          </button>
          {doc && <span className="tp-muted ml-1 border-l pl-2 text-xs tp-border">{doc.numPages} pages</span>}
        </div>
      </div>
      <div ref={box} className="tp-card overflow-x-auto p-2" style={{ background: 'color-mix(in srgb, var(--tp-text) 7%, var(--tp-surface))' }}>
        {error ? (
          <div className="p-6 text-center text-sm text-red-700">
            Could not display this PDF here ({error}).{' '}
            <a href={url} target="_blank" rel="noreferrer" className="underline">
              Open it directly
            </a>
          </div>
        ) : !doc ? (
          <div className="flex h-[60vh] items-center justify-center text-stone-500">Loading PDF…</div>
        ) : (
          Array.from({ length: doc.numPages }, (_, i) => <PdfPage key={i} doc={doc} index={i} width={width} zoom={zoom} />)
        )}
      </div>
    </div>
  );
}
