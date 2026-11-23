import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Download, ExternalLink, Maximize2 } from 'lucide-react';
import type { Material, MaterialAccess } from '../../../shared/types';
import { renderMarkdown } from '../../lib/markdown';
import { t, type Lang } from '../../lib/i18n';
import { KindIcon } from '../../components/KindIcon';
import MediaPlayer from './MediaPlayer';
import AudioPlayer from './AudioPlayer';

const PdfViewer = lazy(() => import('./PdfViewer'));
const DocxViewer = lazy(() => import('./DocxViewer'));

function Frame({ src, title, ratio = 'aspect-video', sandbox, lang }: { src: string; title: string; ratio?: string; sandbox?: string; lang: Lang }) {
  const wrap = useRef<HTMLDivElement>(null);
  return (
    <div>
      <div ref={wrap} className={`tp-card overflow-hidden bg-white ${ratio}`}>
        <iframe
          src={src}
          title={title}
          className="h-full w-full"
          sandbox={sandbox}
          allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media"
          allowFullScreen
          loading="lazy"
        />
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <button className="tp-chip" onClick={() => wrap.current?.requestFullscreen?.()}>
          <Maximize2 className="h-4 w-4" /> {t(lang, 'fullscreen')}
        </button>
        <a className="tp-chip" href={src} target="_blank" rel="noreferrer">
          <ExternalLink className="h-4 w-4" /> {t(lang, 'open_new_tab')}
        </a>
      </div>
    </div>
  );
}

/** HTML lessons are shown full-length as part of the page — no frame, no inner scrollbar. */
function HtmlPage({ src, title }: { src: string; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow || e.data?.type !== 'studyhub:height') return;
      const h = Number(e.data.h) || 0;
      if (h > 0) setHeight(Math.min(h, 100000));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  return (
    <iframe
      ref={ref}
      src={src}
      title={title}
      scrolling={height ? 'no' : 'auto'}
      className="block w-full border-0 bg-transparent"
      style={{ height: height ?? '80vh' }}
      sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin allow-downloads"
      allow="autoplay; fullscreen; clipboard-write"
    />
  );
}

function officeUrl(url: string) {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
}

export function Viewer({ material: m, access, lang }: { material: Material; access: MaterialAccess; lang: Lang }) {
  const [docxFailed, setDocxFailed] = useState(false);
  const onDocxFail = useCallback(() => setDocxFailed(true), []);
  const loading = <div className="flex h-[50vh] items-center justify-center tp-muted">{t(lang, 'loading')}</div>;

  if (m.kind === 'embed' && access.embedUrl) return <Frame src={access.embedUrl} title={m.title} lang={lang} />;
  if (m.kind === 'note' && !access.fileUrl) {
    return <div className="tp-card tp-prose p-5 sm:p-8" dangerouslySetInnerHTML={{ __html: renderMarkdown(access.bodyMd) }} />;
  }
  if (m.kind === 'html' && access.bundleUrl) {
    return <HtmlPage src={access.bundleUrl} title={m.title} />;
  }
  const url = access.fileUrl;
  if (!url) {
    return <div className="tp-card p-10 text-center tp-muted">{t(lang, 'not_ready')}</div>;
  }
  switch (m.kind) {
    case 'pdf':
      return (
        <Suspense fallback={loading}>
          <PdfViewer url={url} />
        </Suspense>
      );
    case 'doc':
      if (/\.docx$/i.test(m.file_name ?? '') && !docxFailed) {
        return (
          <Suspense fallback={loading}>
            <DocxViewer url={url} fallback={onDocxFail} />
          </Suspense>
        );
      }
      return <Frame src={officeUrl(url)} title={m.title} ratio="h-[80vh]" lang={lang} />;
    case 'slides':
    case 'sheet':
      return <Frame src={officeUrl(url)} title={m.title} ratio="h-[75vh]" lang={lang} />;
    case 'audio':
      return <AudioPlayer url={url} id={m.id} title={m.title} lang={lang} />;
    case 'video':
      return <MediaPlayer url={url} kind="video" id={m.id} title={m.title} poster={m.cover_asset ? `/api/assets/${m.cover_asset}` : undefined} />;
    case 'image':
      return (
        <a href={url} target="_blank" rel="noreferrer" className="tp-card block overflow-hidden">
          <img src={url} alt={m.title} className="mx-auto max-h-[80vh] object-contain" />
        </a>
      );
    case 'note':
      return <div className="tp-card tp-prose p-5 sm:p-8" dangerouslySetInnerHTML={{ __html: renderMarkdown(access.bodyMd) }} />;
    default:
      return (
        <div className="tp-card flex flex-col items-center gap-4 p-10 text-center">
          <KindIcon kind={m.kind} className="h-12 w-12" />
          <div className="font-medium">{m.file_name?.split('/').pop()}</div>
          {access.downloadUrl ? (
            <a className="tp-btn" href={access.downloadUrl}>
              <Download className="h-4 w-4" /> {t(lang, 'download')}
            </a>
          ) : (
            <a className="tp-btn" href={url} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" /> {t(lang, 'open')}
            </a>
          )}
        </div>
      );
  }
}
