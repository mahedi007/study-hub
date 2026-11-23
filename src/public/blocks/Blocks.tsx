import { useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, Facebook, Mail, MapPin, Phone, Pin, Search, Youtube, MessageCircle, ExternalLink } from 'lucide-react';
import type { Block, Collection, Material, PageLayout, PublicPageData } from '../../../shared/types';
import { KIND_LABELS, bnNum, iconFor, isNew } from '../../../shared/design';
import { renderMarkdown } from '../../lib/markdown';
import { toEmbedUrl } from '../../lib/embed';
import { t, type Lang } from '../../lib/i18n';
import { PLink } from '../ThemedShell';
import { SquiggleTitle, lastWord } from '../Squiggle';

export interface BlockCtx {
  data: PublicPageData;
  lang: Lang;
  preview?: boolean;
  layout: PageLayout;
}

const assetSrc = (id: string | null) => (id ? `/api/assets/${id}` : '');

export function niceDate(ts: number, lang: Lang) {
  return new Date(ts).toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export const num = (n: number, lang: Lang) => (lang === 'bn' ? bnNum(n) : String(n));

function Heading({ children }: { children: string }) {
  if (!children) return null;
  return <h2 className="tp-h mb-5 text-2xl font-bold sm:text-[28px]">{children}</h2>;
}

// ---------- Material cards ----------

function Tags({ m, lang }: { m: Material; lang: Lang }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className="tp-badge" data-kind>
        {KIND_LABELS[m.kind][lang]}
      </span>
      {m.audio_file && m.kind !== 'audio' && (
        <span className="tp-badge" data-kind>
          {KIND_LABELS.audio[lang]}
        </span>
      )}
      {m.class_level && <span className="tp-badge">{m.class_level}</span>}
    </div>
  );
}

export function MaterialCard({ m, handle, view, lang, preview, large, index = 0 }: { m: Material; handle: string; view: PageLayout['materialsView']; lang: Lang; preview?: boolean; large?: boolean; index?: number }) {
  const to = `/t/${handle}/m/${m.id}`;
  const delay = { animationDelay: `${Math.min(index, 12) * 70}ms` };
  if (view === 'compact') {
    return (
      <PLink to={to} preview={preview} className="tp-card tp-enter flex items-center gap-3 px-4 py-2.5" style={delay}>
        <span className="text-xl">{iconFor(m)}</span>
        <span className="tp-h flex-1 truncate font-semibold">{m.title}</span>
        {isNew(m.created_at) && <span className="tp-new">{lang === 'bn' ? 'নতুন' : 'New'}</span>}
        <ArrowRight className="tp-primary h-4 w-4 shrink-0" />
      </PLink>
    );
  }
  if (view === 'list' && !large) {
    return (
      <PLink to={to} preview={preview} className="tp-card tp-enter flex items-center gap-4 p-3" style={delay}>
        <div className="tp-cover h-16 w-16 shrink-0 rounded-[calc(var(--tp-radius)*0.6)] [&>b]:!text-3xl" style={{ borderRadius: 'calc(var(--tp-radius) * 0.6)' }}>
          {m.cover_asset ? <img src={assetSrc(m.cover_asset)} alt="" className="absolute inset-0 z-10 h-full w-full object-cover" /> : <b>{iconFor(m)}</b>}
        </div>
        <div className="min-w-0 flex-1">
          {m.subject && <div className="text-xs font-bold tracking-wide" style={{ color: 'var(--tp-primary)' }}>{m.subject}</div>}
          <div className="tp-h truncate text-lg font-bold">{m.title}</div>
          <div className="mt-1">
            <Tags m={m} lang={lang} />
          </div>
        </div>
        {isNew(m.created_at) && <span className="tp-new hidden sm:inline">{lang === 'bn' ? 'নতুন' : 'New'}</span>}
      </PLink>
    );
  }
  return (
    <PLink to={to} preview={preview} className="tp-card tp-enter flex flex-col overflow-hidden" style={delay}>
      <div className={`tp-cover ${large ? 'h-44' : 'h-[130px]'}`}>
        {m.cover_asset ? <img src={assetSrc(m.cover_asset)} alt="" loading="lazy" className="absolute inset-0 z-10 h-full w-full object-cover" /> : <b>{iconFor(m)}</b>}
        {isNew(m.created_at) && <span className="tp-new absolute right-3 top-3 z-20">{lang === 'bn' ? 'নতুন' : 'New'}</span>}
      </div>
      <div className="flex flex-1 flex-col gap-2 px-5 pb-4 pt-4">
        {m.subject && <div className="text-[13px] font-bold tracking-wide" style={{ color: 'var(--tp-primary)' }}>{m.subject}</div>}
        <h3 className={`tp-h font-bold leading-snug ${large ? 'text-2xl' : 'text-[22px]'}`}>{m.title}</h3>
        {m.description && <p className="tp-muted line-clamp-3 text-[15px] leading-relaxed">{m.description}</p>}
        <Tags m={m} lang={lang} />
        <div className="tp-muted mt-auto flex items-center justify-between pt-3 text-sm">
          <span>{niceDate(m.created_at, lang)}</span>
          <span className="inline-flex items-center gap-1.5 font-bold" style={{ color: 'var(--tp-primary)' }}>
            {lang === 'bn' ? 'খুলো' : 'Open'} <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </PLink>
  );
}

export function MaterialGrid({ items, ctx, large }: { items: Material[]; ctx: BlockCtx; large?: boolean }) {
  const view = large ? 'grid' : ctx.layout.materialsView;
  const cls = view === 'grid' ? (large ? 'grid gap-7 sm:grid-cols-2' : 'grid gap-[26px] grid-cols-[repeat(auto-fill,minmax(270px,1fr))]') : 'grid gap-3';
  return (
    <div className={cls}>
      {items.map((m, i) => (
        <MaterialCard key={m.id} m={m} handle={ctx.data.teacher.handle} view={view} lang={ctx.lang} preview={ctx.preview} large={large} index={i} />
      ))}
    </div>
  );
}

function CollectionCard({ c, ctx, style, index }: { c: Collection; ctx: BlockCtx; style: 'cards' | 'list'; index: number }) {
  const to = `/t/${ctx.data.teacher.handle}/c/${c.id}`;
  const count = `${num(c.item_count ?? 0, ctx.lang)} ${t(ctx.lang, 'items')}`;
  const delay = { animationDelay: `${index * 70}ms` };
  if (style === 'list') {
    return (
      <PLink to={to} preview={ctx.preview} className="tp-card tp-enter flex items-center gap-4 p-3" style={delay}>
        <div className="tp-cover h-14 w-14 shrink-0 [&>b]:!text-2xl" style={{ borderRadius: 'calc(var(--tp-radius) * 0.6)' }}>
          {c.cover_asset ? <img src={assetSrc(c.cover_asset)} alt="" className="absolute inset-0 z-10 h-full w-full object-cover" /> : <b>📚</b>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="tp-h text-lg font-bold">{c.title}</div>
          <div className="tp-muted text-sm">{count}</div>
        </div>
        <ArrowRight className="tp-primary h-5 w-5" />
      </PLink>
    );
  }
  return (
    <PLink to={to} preview={ctx.preview} className="tp-card tp-enter flex flex-col overflow-hidden" style={delay}>
      <div className="tp-cover h-[120px]">
        {c.cover_asset ? <img src={assetSrc(c.cover_asset)} alt="" className="absolute inset-0 z-10 h-full w-full object-cover" /> : <b>📚</b>}
        <span className="tp-new absolute bottom-3 right-3 z-20">{count}</span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 px-5 pb-4 pt-4">
        <h3 className="tp-h text-xl font-bold">{c.title}</h3>
        {c.description && <p className="tp-muted line-clamp-2 text-[15px]">{c.description}</p>}
        <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-bold" style={{ color: 'var(--tp-primary)' }}>
          {ctx.lang === 'bn' ? 'শুরু করো' : 'Start'} <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </PLink>
  );
}

// ---------- Blocks ----------

function HeroBlock({ b, ctx }: { b: Extract<Block, { type: 'hero' }>; ctx: BlockCtx }) {
  const avatar = b.avatarAsset ? assetSrc(b.avatarAsset) : ctx.data.teacher.avatar_url;
  const center = b.align === 'center';
  const highlight = b.highlight === undefined ? lastWord(b.title) : b.highlight;
  const cta = b.ctaLabel && b.ctaHref && (
    <PLink to={b.ctaHref} preview={ctx.preview} className="tp-btn mt-6">
      {b.ctaLabel} <ArrowRight className="h-4 w-4" />
    </PLink>
  );
  const kicker = b.kicker ? <span className="tp-kicker">{b.kicker}</span> : null;
  const title = (cls: string) => (
    <h1 className={`tp-h font-extrabold ${cls}`}>
      <SquiggleTitle text={b.title} highlight={highlight} />
    </h1>
  );

  if (b.style === 'editorial') {
    return (
      <section className={`relative pb-2 pt-6 ${center ? 'text-center' : ''}`}>
        {avatar && b.avatarAsset && <img src={avatar} alt="" className={`mb-5 h-20 w-20 rounded-full border-[1.5px] object-cover ${center ? 'mx-auto' : ''}`} style={{ borderColor: 'var(--tp-ink)', boxShadow: '3px 3px 0 var(--tp-ink)' }} />}
        {kicker}
        {title('mt-4 text-[clamp(38px,9vw,74px)] leading-[1.3]')}
        {b.subtitle && <p className={`tp-muted mt-5 max-w-[34em] text-[19px] ${center ? 'mx-auto' : ''}`}>{b.subtitle}</p>}
        {cta}
      </section>
    );
  }
  if (b.style === 'banner') {
    return (
      <section className="tp-card relative overflow-hidden" style={{ minHeight: 280 }}>
        {b.bannerAsset ? <img src={assetSrc(b.bannerAsset)} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <div className="tp-cover absolute inset-0" />}
        <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${(b.bannerAsset ? b.overlay : Math.min(b.overlay, 15)) / 100})` }} />
        <div className={`relative flex min-h-[280px] flex-col justify-end gap-2 p-7 text-white sm:p-10 ${center ? 'items-center text-center' : ''}`} style={{ ['--tp-heading-color' as any]: '#fff' }}>
          {avatar && <img src={avatar} alt="" className="mb-2 h-20 w-20 rounded-full border-4 border-white/80 object-cover shadow-lg" />}
          {kicker && <span className="tp-kicker" style={{ color: '#fff', borderColor: '#fff' }}>{b.kicker}</span>}
          {title('text-3xl drop-shadow sm:text-5xl')}
          {b.subtitle && <p className="max-w-2xl text-lg opacity-95">{b.subtitle}</p>}
          {cta}
        </div>
      </section>
    );
  }
  if (b.style === 'split') {
    return (
      <section className="grid items-center gap-8 py-4 sm:grid-cols-2">
        <div className={center ? 'text-center sm:text-left' : ''}>
          {kicker}
          {title('mt-4 text-4xl sm:text-5xl')}
          {b.subtitle && <p className="tp-muted mt-4 text-lg">{b.subtitle}</p>}
          {cta}
        </div>
        <div className="tp-card overflow-hidden">
          {b.bannerAsset || avatar ? <img src={b.bannerAsset ? assetSrc(b.bannerAsset) : avatar!} alt="" className="aspect-[4/3] w-full object-cover" /> : <div className="tp-cover aspect-[4/3] w-full"><b>📚</b></div>}
        </div>
      </section>
    );
  }
  return (
    <section className={`flex flex-col gap-2 py-6 ${center ? 'items-center text-center' : ''}`}>
      {avatar && <img src={avatar} alt="" className="mb-2 h-24 w-24 rounded-full object-cover" style={{ border: '1.5px solid var(--tp-ink)', boxShadow: '3px 3px 0 var(--tp-ink)' }} />}
      {kicker}
      {title('text-4xl sm:text-5xl')}
      {b.subtitle && <p className="tp-muted max-w-2xl text-lg">{b.subtitle}</p>}
      {cta}
    </section>
  );
}

function MaterialsBlock({ b, ctx }: { b: Extract<Block, { type: 'materials' }>; ctx: BlockCtx }) {
  const [q, setQ] = useState('');
  const [subject, setSubject] = useState('');
  const [cls, setCls] = useState('');
  const [kind, setKind] = useState('');
  const base = useMemo(
    () =>
      ctx.data.materials.filter(
        (m) => (!b.subject || m.subject === b.subject) && (!b.classLevel || m.class_level === b.classLevel) && (!b.kind || m.kind === b.kind) && (!b.tag || m.tags.includes(b.tag)),
      ),
    [ctx.data.materials, b.subject, b.classLevel, b.kind, b.tag],
  );
  const subjects = useMemo(() => [...new Set(base.map((m) => m.subject).filter(Boolean))].sort(), [base]);
  const classes = useMemo(() => [...new Set(base.map((m) => m.class_level).filter(Boolean))].sort(), [base]);
  const kinds = useMemo(() => [...new Set(base.map((m) => m.kind))], [base]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = base.filter(
      (m) =>
        (!subject || m.subject === subject) &&
        (!cls || m.class_level === cls) &&
        (!kind || m.kind === kind) &&
        (!needle || `${m.title} ${m.description} ${m.subject} ${m.class_level} ${m.tags.join(' ')}`.toLowerCase().includes(needle)),
    );
    return b.limit > 0 ? list.slice(0, b.limit) : list;
  }, [base, q, subject, cls, kind, b.limit]);

  const chips = (values: string[], value: string, set: (v: string) => void, label: (v: string) => string = (v) => v, showAll = true) =>
    values.length > 0 && (
      <>
        {showAll && (
          <button className="tp-chip" data-active={!value} onClick={() => set('')}>
            {t(ctx.lang, 'all')}
          </button>
        )}
        {values.map((v) => (
          <button key={v} className="tp-chip" data-active={value === v} onClick={() => set(value === v ? '' : v)}>
            {label(v)}
          </button>
        ))}
      </>
    );

  return (
    <section>
      <Heading>{b.heading}</Heading>
      {(b.showSearch || b.showFilters) && (
        <div className="flex flex-wrap items-center gap-3">
          {b.showSearch && (
            <label className="tp-search min-w-[240px] flex-[1_1_260px]">
              <Search className="h-5 w-5 shrink-0" style={{ color: 'var(--tp-primary)' }} strokeWidth={2.2} />
              <input placeholder={ctx.lang === 'bn' ? 'খুঁজে দেখো...' : 'Search…'} value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
          )}
          {b.showFilters && <div className="flex flex-wrap gap-2">{chips(subjects, subject, setSubject)}</div>}
        </div>
      )}
      {b.showFilters && (classes.length > 1 || kinds.length > 1) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {classes.length > 1 && chips(classes, cls, setCls, (v) => v, false)}
          {kinds.length > 1 && chips(kinds, kind, setKind, (k) => KIND_LABELS[k as Material['kind']][ctx.lang], false)}
        </div>
      )}
      <p className="tp-muted mx-0.5 mb-5 mt-3.5 text-[15px]">
        {ctx.lang === 'bn' ? `${num(filtered.length, 'bn')}টি ম্যাটেরিয়াল` : `${filtered.length} materials`}
      </p>
      {filtered.length ? (
        <MaterialGrid items={filtered} ctx={ctx} />
      ) : (
        <div className="tp-muted rounded-[var(--tp-radius)] border-[1.5px] border-dashed p-12 text-center tp-border">{t(ctx.lang, 'no_materials')}</div>
      )}
    </section>
  );
}

function VideoBlock({ b }: { b: Extract<Block, { type: 'video' }> }) {
  const src = toEmbedUrl(b.url);
  return (
    <section>
      <Heading>{b.heading}</Heading>
      {src ? (
        <div className="tp-card aspect-video overflow-hidden bg-black">
          <iframe src={src} title={b.heading || 'Video'} className="h-full w-full" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowFullScreen loading="lazy" />
        </div>
      ) : (
        <div className="tp-card tp-muted p-8 text-center text-sm">Paste a YouTube, Vimeo or Facebook video link.</div>
      )}
    </section>
  );
}

function ContactBlock({ b, ctx }: { b: Extract<Block, { type: 'contact' }>; ctx: BlockCtx }) {
  const items = [
    b.phone && { icon: Phone, label: b.phone, href: `tel:${b.phone.replace(/\s/g, '')}` },
    b.whatsapp && { icon: MessageCircle, label: 'WhatsApp', href: `https://wa.me/${b.whatsapp.replace(/[^\d]/g, '')}` },
    b.email && { icon: Mail, label: b.email, href: `mailto:${b.email}` },
    b.facebook && { icon: Facebook, label: 'Facebook', href: b.facebook },
    b.youtube && { icon: Youtube, label: 'YouTube', href: b.youtube },
  ].filter(Boolean) as { icon: typeof Phone; label: string; href: string }[];
  if (!items.length && !b.address) return ctx.preview ? <div className="tp-card tp-muted p-6 text-center text-sm">Add contact details in the editor.</div> : null;
  return (
    <section>
      <Heading>{b.heading}</Heading>
      <div className="tp-card flex flex-wrap gap-2 p-5">
        {items.map((it) => (
          <PLink key={it.href} to={it.href} preview={ctx.preview} className="tp-chip">
            <it.icon className="h-4 w-4" /> {it.label}
          </PLink>
        ))}
        {b.address && (
          <span className="tp-muted flex w-full items-center gap-1.5 pt-1 text-sm">
            <MapPin className="h-4 w-4" /> {b.address}
          </span>
        )}
      </div>
    </section>
  );
}

function FaqBlock({ b }: { b: Extract<Block, { type: 'faq' }> }) {
  return (
    <section>
      <Heading>{b.heading}</Heading>
      <div className="space-y-3">
        {b.items.map((it, i) => (
          <details key={i} className="tp-card group px-5 py-4">
            <summary className="tp-h flex cursor-pointer list-none items-center justify-between gap-3 text-lg font-bold">
              {it.q}
              <ChevronDown className="h-5 w-5 shrink-0 transition group-open:rotate-180" />
            </summary>
            <div className="tp-prose tp-muted mt-2" dangerouslySetInnerHTML={{ __html: renderMarkdown(it.a) }} />
          </details>
        ))}
      </div>
    </section>
  );
}

function GalleryBlock({ b }: { b: Extract<Block, { type: 'gallery' }> }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section>
      <Heading>{b.heading}</Heading>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {b.assets.map((id) => (
          <button key={id} onClick={() => setOpen(id)} className="tp-card overflow-hidden">
            <img src={assetSrc(id)} alt="" loading="lazy" className="aspect-square w-full object-cover transition hover:scale-105" />
          </button>
        ))}
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setOpen(null)}>
          <img src={assetSrc(open)} alt="" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </section>
  );
}

export function BlockView({ block: b, ctx }: { block: Block; ctx: BlockCtx }) {
  switch (b.type) {
    case 'hero':
      return <HeroBlock b={b} ctx={ctx} />;
    case 'text':
      return (
        <section>
          <Heading>{b.heading}</Heading>
          <div className="tp-prose max-w-3xl text-[17px]" dangerouslySetInnerHTML={{ __html: renderMarkdown(b.body) }} />
        </section>
      );
    case 'announcements': {
      const list = ctx.data.announcements.slice(0, b.limit || 5);
      if (!list.length) return ctx.preview ? <div className="tp-card tp-muted p-6 text-center text-sm">Your notices will appear here.</div> : null;
      return (
        <section>
          <Heading>{b.heading}</Heading>
          <div className="space-y-3">
            {list.map((a, i) => (
              <article
                key={a.id}
                className="tp-enter rounded-[calc(var(--tp-radius)*0.7)] px-5 py-3"
                style={{ animationDelay: `${i * 60}ms`, background: a.pinned ? 'var(--tp-accent-soft)' : 'var(--tp-surface)', border: '1.5px solid var(--tp-ink)' }}
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="flex items-center gap-1.5 font-bold">
                    {a.pinned && <Pin className="h-4 w-4" />} {a.title}
                  </h3>
                  <span className="tp-muted shrink-0 text-xs">{niceDate(a.created_at, ctx.lang)}</span>
                </div>
                {a.body_md && <div className="tp-prose text-[15px]" dangerouslySetInnerHTML={{ __html: renderMarkdown(a.body_md) }} />}
              </article>
            ))}
          </div>
        </section>
      );
    }
    case 'collections': {
      const list = b.ids.length ? b.ids.map((id) => ctx.data.collections.find((c) => c.id === id)).filter((c): c is Collection => !!c) : ctx.data.collections;
      if (!list.length) return ctx.preview ? <div className="tp-card tp-muted p-6 text-center text-sm">Publish a collection to show it here.</div> : null;
      return (
        <section>
          <Heading>{b.heading}</Heading>
          <div className={b.style === 'cards' ? 'grid gap-[26px] grid-cols-[repeat(auto-fill,minmax(270px,1fr))]' : 'grid gap-3'}>
            {list.map((c, i) => (
              <CollectionCard key={c.id} c={c} ctx={ctx} style={b.style} index={i} />
            ))}
          </div>
        </section>
      );
    }
    case 'materials':
      return <MaterialsBlock b={b} ctx={ctx} />;
    case 'featured': {
      const list = b.ids.map((id) => ctx.data.materials.find((m) => m.id === id)).filter((m): m is Material => !!m);
      if (!list.length) return ctx.preview ? <div className="tp-card tp-muted p-6 text-center text-sm">Pick published materials to feature.</div> : null;
      return (
        <section>
          <Heading>{b.heading}</Heading>
          <MaterialGrid items={list} ctx={ctx} large />
        </section>
      );
    }
    case 'video':
      return <VideoBlock b={b} />;
    case 'links':
      return (
        <section>
          <Heading>{b.heading}</Heading>
          <div className="mx-auto flex max-w-xl flex-col gap-3">
            {b.links.filter((l) => l.label).map((l, i) => (
              <PLink key={i} to={l.url} preview={ctx.preview} className="tp-btn w-full">
                {l.label} <ExternalLink className="h-4 w-4 opacity-70" />
              </PLink>
            ))}
          </div>
        </section>
      );
    case 'contact':
      return <ContactBlock b={b} ctx={ctx} />;
    case 'faq':
      return <FaqBlock b={b} />;
    case 'gallery':
      return b.assets.length ? <GalleryBlock b={b} /> : ctx.preview ? <div className="tp-card tp-muted p-6 text-center text-sm">Add photos in the editor.</div> : null;
    case 'stats':
      return (
        <section>
          <Heading>{b.heading}</Heading>
          <div className="grid grid-cols-3 gap-4">
            {[
              [ctx.data.stats.materials, t(ctx.lang, 'materials_count')],
              [ctx.data.stats.collections, t(ctx.lang, 'collections_count')],
              [ctx.data.stats.views, t(ctx.lang, 'total_views')],
            ].map(([n, label]) => (
              <div key={String(label)} className="tp-card p-4 text-center">
                <div className="tp-h text-3xl font-extrabold">{num(Number(n), ctx.lang)}</div>
                <div className="tp-muted text-sm">{label}</div>
              </div>
            ))}
          </div>
        </section>
      );
    case 'divider':
      if (b.style === 'space') return <div className="h-6" />;
      if (b.style === 'dots') return <div className="tp-muted py-2 text-center tracking-[1em]">•••</div>;
      return <hr className="tp-border border-t-[1.5px]" />;
  }
  return null;
}

