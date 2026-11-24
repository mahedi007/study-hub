import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, CheckCircle2, Circle, List, X } from 'lucide-react';
import type { Collection, CollectionItem, Material, MaterialAccess } from '../../shared/types';
import { t, type Lang } from '../lib/i18n';
import { KindIcon } from '../components/KindIcon';
import { MaterialView, ShareButtons } from './MaterialView';
import { PLink } from './ThemedShell';
import { SquiggleTitle, lastWord } from './Squiggle';

function useProgress(key: string) {
  const storageKey = `studyhub.progress.${key}`;
  const [done, setDone] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    } catch {
      return [];
    }
  });
  const toggle = (id: string) =>
    setDone((d) => {
      const next = d.includes(id) ? d.filter((x) => x !== id) : [...d, id];
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  return { done, toggle };
}

export function CollectionView({
  collection,
  items,
  lang,
  progressKey,
  loadItem,
  backTo,
  backLabel,
}: {
  collection: Collection;
  items: CollectionItem[];
  lang: Lang;
  progressKey: string;
  loadItem: (materialId: string) => Promise<{ material: Material; access: MaterialAccess }>;
  backTo?: string;
  backLabel?: string;
}) {
  const [params, setParams] = useSearchParams();
  const current = params.get('item');
  const [tocOpen, setTocOpen] = useState(false);
  const { done, toggle } = useProgress(progressKey);
  const index = items.findIndex((i) => i.material_id === current);

  const select = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('item', id);
    else next.delete('item');
    setParams(next);
    setTocOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const item = useQuery({ queryKey: ['col-item', progressKey, current], queryFn: () => loadItem(current!), enabled: !!current, staleTime: 5 * 60 * 1000 });

  const sections = useMemo(() => {
    const out: { name: string; items: CollectionItem[] }[] = [];
    for (const it of items) {
      const last = out[out.length - 1];
      if (!last || last.name !== it.section) out.push({ name: it.section, items: [it] });
      else last.items.push(it);
    }
    return out;
  }, [items]);

  const pct = items.length ? Math.round((items.filter((i) => done.includes(i.material_id)).length / items.length) * 100) : 0;

  useEffect(() => {
    if (current && index === -1 && items.length) select(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, index, items.length]);

  const toc = (
    <nav className="space-y-4">
      <div>
        <div className="mb-1 flex justify-between text-xs">
          <span className="tp-muted">{t(lang, 'progress')}</span>
          <span className="font-semibold">{pct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full" style={{ background: 'color-mix(in srgb, var(--tp-text) 10%, transparent)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'var(--tp-primary)' }} />
        </div>
      </div>
      {sections.map((s, si) => (
        <div key={si}>
          {s.name && <div className="tp-muted mb-1.5 text-xs font-semibold uppercase tracking-wide">{s.name}</div>}
          <ul className="space-y-1">
            {s.items.map((it) => {
              const m = it.material!;
              const active = it.material_id === current;
              const isDone = done.includes(it.material_id);
              return (
                <li key={it.material_id}>
                  <button
                    onClick={() => select(it.material_id)}
                    className="flex w-full items-center gap-2.5 rounded-[calc(var(--tp-radius)*0.6)] px-2.5 py-2 text-left text-sm transition"
                    style={active ? { background: 'color-mix(in srgb, var(--tp-primary) 14%, transparent)', fontWeight: 600 } : undefined}
                  >
                    {isDone ? <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: 'var(--tp-primary)' }} /> : <KindIcon kind={m.kind} className="h-4 w-4 shrink-0 opacity-70" />}
                    <span className="line-clamp-2">{m.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div>
      {backTo && (
        <PLink to={backTo} className="mb-4 inline-flex items-center gap-1.5 text-[15px] font-semibold hover:opacity-70" style={{ color: 'var(--tp-primary)' }}>
          <ArrowLeft className="h-4 w-4" /> {backLabel ?? (lang === 'bn' ? 'সব ম্যাটেরিয়াল' : 'All materials')}
        </PLink>
      )}
      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="tp-card sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto p-4">
            <button onClick={() => select(null)} className="tp-h mb-3 block text-left font-bold">
              {collection.title}
            </button>
            {toc}
          </div>
        </aside>

        <div className="min-w-0">
          <button className="tp-chip mb-4 lg:hidden" onClick={() => setTocOpen(true)}>
            <List className="h-4 w-4" /> {t(lang, 'contents')} · {pct}%
          </button>

          {!current ? (
            <div>
              <span className="tp-kicker">{lang === 'bn' ? `${items.length.toLocaleString('bn-BD')}টি উপকরণ` : `${items.length} items`}</span>
              <h1 className="tp-h mt-3 text-[clamp(32px,6vw,54px)] font-extrabold leading-[1.3]">
                <SquiggleTitle text={collection.title} highlight={lastWord(collection.title)} />
              </h1>
              {collection.description && <p className="tp-muted mt-3 max-w-[38em] whitespace-pre-line text-[18px]">{collection.description}</p>}
              {collection.cover_asset && <img src={`/api/assets/${collection.cover_asset}`} alt="" className="tp-card mt-6 aspect-[16/6] w-full object-cover" />}
              <div className="mt-4 flex flex-wrap gap-2">
                {items.length > 0 && (
                  <button className="tp-btn" onClick={() => select((items.find((i) => !done.includes(i.material_id)) ?? items[0]).material_id)}>
                    {pct > 0 ? t(lang, 'next') : t(lang, 'open')} <ArrowRight className="h-4 w-4" />
                  </button>
                )}
                <ShareButtons lang={lang} title={collection.title} />
              </div>
              <div className="mt-8 lg:hidden">{items.length ? toc : <p className="tp-muted">{t(lang, 'empty_collection')}</p>}</div>
              {!items.length && <p className="tp-muted mt-8 hidden lg:block">{t(lang, 'empty_collection')}</p>}
            </div>
          ) : item.isLoading ? (
            <div className="tp-muted flex h-[50vh] items-center justify-center">{t(lang, 'loading')}</div>
          ) : item.error || !item.data ? (
            <div className="tp-card p-8 text-center">{(item.error as Error)?.message ?? t(lang, 'not_found')}</div>
          ) : (
            <>
              <MaterialView material={item.data.material} access={item.data.access} lang={lang} compact />
              <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t tp-border pt-5">
                <button className="tp-btn tp-btn-ghost" disabled={index <= 0} style={{ opacity: index <= 0 ? 0.4 : 1 }} onClick={() => index > 0 && select(items[index - 1].material_id)}>
                  <ArrowLeft className="h-4 w-4" /> {t(lang, 'previous')}
                </button>
                <button className="tp-chip" data-active={done.includes(current)} onClick={() => toggle(current)}>
                  {done.includes(current) ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                  {done.includes(current) ? t(lang, 'done') : t(lang, 'mark_done')}
                </button>
                <button
                  className="tp-btn"
                  disabled={index >= items.length - 1}
                  style={{ opacity: index >= items.length - 1 ? 0.4 : 1 }}
                  onClick={() => {
                    if (!done.includes(current)) toggle(current);
                    if (index < items.length - 1) select(items[index + 1].material_id);
                  }}
                >
                  {t(lang, 'next')} <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {tocOpen && (
        <div className="fixed inset-0 z-50 flex bg-black/40 lg:hidden" onClick={() => setTocOpen(false)}>
          <div className="tp-root h-full w-[85%] max-w-sm overflow-y-auto p-5" style={{ minHeight: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <span className="tp-h font-bold">{collection.title}</span>
              <button onClick={() => setTocOpen(false)} aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            {toc}
          </div>
        </div>
      )}
    </div>
  );
}
