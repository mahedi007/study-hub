import { useState } from 'react';
import { ArrowLeft, Check, Download, Link2, MessageCircle } from 'lucide-react';
import type { Material, MaterialAccess, PublicTeacher } from '../../shared/types';
import { t, type Lang } from '../lib/i18n';
import { copyText } from '../lib/format';
import { Viewer } from './viewers/Viewer';
import AudioPlayer from './viewers/AudioPlayer';
import { PLink } from './ThemedShell';
import { SquiggleTitle, lastWord } from './Squiggle';

export function ShareButtons({ lang, title }: { lang: Lang; title: string }) {
  const [copied, setCopied] = useState(false);
  const url = window.location.href;
  return (
    <>
      <button
        className="tp-chip"
        onClick={async () => {
          await copyText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }}
      >
        {copied ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />} {copied ? t(lang, 'copied') : t(lang, 'copy_link')}
      </button>
      <a className="tp-chip" href={`https://wa.me/?text=${encodeURIComponent(`${title} — ${url}`)}`} target="_blank" rel="noreferrer">
        <MessageCircle className="h-4 w-4" /> WhatsApp
      </a>
    </>
  );
}

export function MaterialView({
  material: m,
  access,
  lang,
  backTo,
  backLabel,
  compact,
}: {
  material: Material;
  access: MaterialAccess;
  lang: Lang;
  backTo?: string;
  backLabel?: string;
  teacher?: PublicTeacher;
  compact?: boolean;
}) {
  const kicker = [m.subject, m.class_level].filter(Boolean).join(' · ');
  return (
    <article>
      {backTo && (
        <PLink to={backTo} className="mb-4 inline-flex items-center gap-1.5 text-[15px] font-semibold hover:opacity-70" style={{ color: 'var(--tp-primary)' }}>
          <ArrowLeft className="h-4 w-4" /> {backLabel ?? (lang === 'bn' ? 'ফিরে যাও' : 'Back')}
        </PLink>
      )}
      <header className={compact ? 'mb-6' : 'mb-8 pt-2'}>
        {kicker && <span className="tp-kicker">{kicker}</span>}
        <h1 className={`tp-h mt-3 font-extrabold leading-[1.3] ${compact ? 'text-[clamp(28px,5vw,40px)]' : 'text-[clamp(34px,7.5vw,62px)]'}`}>
          <SquiggleTitle text={m.title} highlight={lastWord(m.title)} />
        </h1>
        {m.description && <p className="tp-muted mt-4 max-w-[38em] whitespace-pre-line text-[18px]">{m.description}</p>}
      </header>

      {access.audioUrl && (
        <div className="mb-8">
          <AudioPlayer url={access.audioUrl} id={`${m.id}-lecture`} title={lang === 'bn' ? 'লেকচার অডিও' : 'Lecture audio'} lang={lang} />
        </div>
      )}

      <Viewer material={m} access={access} lang={lang} />

      <div className="mt-8 flex flex-wrap items-center gap-2.5">
        {access.downloadUrl && (
          <a className="tp-btn" href={access.downloadUrl}>
            <Download className="h-4 w-4" /> {t(lang, 'download')}
          </a>
        )}
        <ShareButtons lang={lang} title={m.title} />
      </div>
    </article>
  );
}
