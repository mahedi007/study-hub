import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Search, Users } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { t, useLang, type Lang } from '../lib/i18n';
import { presetTheme } from '../../shared/design';
import type { Collection, CollectionItem, Material, MaterialAccess, PageDesign, PublicPageData, PublicTeacher, SiteSettings, Theme } from '../../shared/types';
import { PageView } from './PageView';
import { Brand, LangToggle, PLink, ThemedShell } from './ThemedShell';
import { SquiggleTitle, lastWord } from './Squiggle';
import { MaterialView } from './MaterialView';
import { CollectionView } from './CollectionView';
import { MaterialCard, num } from './blocks/Blocks';
import { renderMarkdown } from '../lib/markdown';

const DEFAULT_THEME = presetTheme('munjiba');

function useTitle(title?: string) {
  useEffect(() => {
    if (title) document.title = title;
  }, [title]);
}

function Status({ theme = DEFAULT_THEME, title, message, lang = 'bn' }: { theme?: Theme; title: string; message?: string; lang?: Lang }) {
  const [l, setL] = useLang(lang);
  return (
    <ThemedShell theme={theme} lang={l} setLang={setL} layout={{ width: 'narrow', headerStyle: 'none' }}>
      <div className="tp-card mx-auto mt-20 max-w-md p-10 text-center">
        <h1 className="tp-h text-3xl font-bold">{title}</h1>
        {message && <p className="tp-muted mt-2">{message}</p>}
        <PLink to="/" className="tp-btn mt-6">
          {t(l, 'home')}
        </PLink>
      </div>
    </ThemedShell>
  );
}

function Loading({ theme = DEFAULT_THEME }: { theme?: Theme }) {
  return (
    <div className="tp-root flex items-center justify-center" style={{ background: theme.bg }}>
      <div className="h-9 w-9 animate-spin rounded-full border-4" style={{ borderColor: `${theme.accent}55`, borderTopColor: theme.primary }} />
    </div>
  );
}

// ---------- Home ----------

type SiteResponse = {
  homeTeacher: string | null;
  settings: SiteSettings & { logoUrl: string | null };
  teachers: (PublicTeacher & { material_count: number })[];
  recent: Material[];
};

export function HomePage() {
  const { data, error, isLoading } = useQuery({ queryKey: ['site'], queryFn: () => api<SiteResponse>('/api/public/site') });
  const [lang, setLang] = useLang(data?.settings.defaultLanguage ?? 'bn');
  const [q, setQ] = useState('');
  useTitle(data?.settings.siteName);
  const recent = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.recent ?? []).filter((m) => !needle || `${m.title} ${m.subject} ${m.class_level} ${m.owner_name}`.toLowerCase().includes(needle));
  }, [data, q]);

  if (isLoading) return <Loading />;
  if (error || !data) return <Status title="Study Hub" message={(error as Error)?.message} />;
  if (data.homeTeacher) return <TeacherPage handleOverride={data.homeTeacher} />;

  const s = data.settings;
  return (
    <ThemedShell theme={DEFAULT_THEME} lang={lang} setLang={setLang} layout={{ width: 'normal', headerStyle: 'none' }} footer={false}>
      <div className="flex items-center justify-between py-1">
        <Brand name={s.siteName} avatar={s.logoUrl} />
        <LangToggle lang={lang} setLang={setLang} />
      </div>
      <section className="pb-4 pt-10">
        <span className="tp-kicker">{lang === 'bn' ? 'অডিও · অনুশীলন · নোট' : 'Audio · Practice · Notes'}</span>
        <h1 className="tp-h mt-4 text-[clamp(38px,9vw,70px)] font-extrabold leading-[1.3]">
          <SquiggleTitle text={s.siteName} highlight={lastWord(s.siteName)} />
        </h1>
        {s.tagline && <p className="tp-muted mt-5 max-w-[34em] text-[19px]">{s.tagline}</p>}
        {s.bannerText && <div className="tp-card tp-prose mt-6 max-w-2xl px-5 py-3" style={{ background: 'var(--tp-accent-soft)' }} dangerouslySetInnerHTML={{ __html: renderMarkdown(s.bannerText) }} />}
      </section>

      {data.teachers.length > 0 && (
        <section className="mb-14 mt-8">
          <h2 className="tp-h mb-5 flex items-center gap-2 text-2xl font-bold">
            <Users className="h-6 w-6" /> {t(lang, 'teachers')}
          </h2>
          <div className="grid gap-[26px] grid-cols-[repeat(auto-fill,minmax(250px,1fr))]">
            {data.teachers.map((tch, i) => (
              <PLink key={tch.id} to={`/t/${tch.handle}`} className="tp-card tp-enter flex items-center gap-4 p-4" style={{ animationDelay: `${i * 70}ms` }}>
                {tch.avatar_url ? (
                  <img src={tch.avatar_url} alt="" className="h-14 w-14 rounded-full object-cover" style={{ border: '1.5px solid var(--tp-ink)' }} />
                ) : (
                  <span className="tp-h flex h-14 w-14 items-center justify-center rounded-full text-xl font-bold" style={{ background: 'var(--tp-primary)', color: 'var(--tp-accent)' }}>
                    {(tch.name || '?').slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <div className="tp-h truncate text-lg font-bold">{tch.name}</div>
                  <div className="tp-muted text-sm">
                    {num(tch.material_count, lang)} {t(lang, 'materials_count')}
                  </div>
                </div>
              </PLink>
            ))}
          </div>
        </section>
      )}

      {data.recent.length > 0 && (
        <section>
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="tp-h text-2xl font-bold">{t(lang, 'recent')}</h2>
            <label className="tp-search sm:w-80">
              <Search className="h-5 w-5" style={{ color: 'var(--tp-primary)' }} />
              <input placeholder={lang === 'bn' ? 'খুঁজে দেখো...' : 'Search…'} value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
          </div>
          <div className="grid gap-[26px] grid-cols-[repeat(auto-fill,minmax(270px,1fr))]">
            {recent.map((m, i) => (
              <MaterialCard key={m.id} m={m} handle={m.owner_handle ?? ''} view="grid" lang={lang} index={i} />
            ))}
          </div>
        </section>
      )}
      <footer className="tp-muted pb-10 pt-14 text-center text-sm">{s.footerText || `©${new Date().getFullYear()} - ${s.siteName}`}</footer>
    </ThemedShell>
  );
}

// ---------- Teacher page ----------

export function TeacherPage({ handleOverride }: { handleOverride?: string }) {
  const params = useParams();
  const handle = handleOverride ?? params.handle ?? '';
  const { data, error, isLoading } = useQuery({
    queryKey: ['page', handle],
    queryFn: () => api<{ design: PageDesign; data: PublicPageData }>(`/api/public/page/${encodeURIComponent(handle)}`),
  });
  const [lang, setLang] = useLang(data?.design.language ?? 'bn');
  useTitle(data ? data.design.seo.title || data.data.teacher.name : undefined);
  useEffect(() => {
    if (!data?.design.seo.description) return;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', data.design.seo.description);
  }, [data]);
  if (isLoading) return <Loading />;
  if (error || !data) return <Status title={t(lang, 'not_found')} message={(error as Error)?.message} />;
  return <PageView design={data.design} data={data.data} lang={lang} setLang={setLang} />;
}

// ---------- Material & collection pages on a teacher site ----------

type MaterialResponse = { material: Material; access: MaterialAccess; teacher: PublicTeacher; theme: Theme; language: Lang };

export function MaterialPage() {
  const { handle = '', id = '' } = useParams();
  const { data, error, isLoading } = useQuery({ queryKey: ['pub-m', id], queryFn: () => api<MaterialResponse>(`/api/public/m/${id}`), staleTime: 10 * 60 * 1000 });
  const [lang, setLang] = useLang(data?.language ?? 'bn');
  useTitle(data?.material.title);
  if (isLoading) return <Loading />;
  if (error || !data) return <Status title={t(lang, 'not_found')} message={(error as Error)?.message} />;
  return (
    <ThemedShell theme={data.theme} teacher={data.teacher} lang={lang} setLang={setLang}>
      <MaterialView material={data.material} access={data.access} lang={lang} backTo={`/t/${handle}`} teacher={data.teacher} />
    </ThemedShell>
  );
}

type CollectionResponse = { collection: Collection; items: CollectionItem[]; teacher: PublicTeacher; theme: Theme; language: Lang };

export function CollectionPage() {
  const { handle = '', id = '' } = useParams();
  const { data, error, isLoading } = useQuery({ queryKey: ['pub-c', id], queryFn: () => api<CollectionResponse>(`/api/public/c/${id}`) });
  const [lang, setLang] = useLang(data?.language ?? 'bn');
  useTitle(data?.collection.title);
  if (isLoading) return <Loading />;
  if (error || !data) return <Status title={t(lang, 'not_found')} message={(error as Error)?.message} />;
  return (
    <ThemedShell theme={data.theme} teacher={data.teacher} lang={lang} setLang={setLang} layout={{ width: 'wide' }}>
      <CollectionView
        collection={data.collection}
        items={data.items}
        lang={lang}
        progressKey={`c-${id}`}
        loadItem={(mid) => api(`/api/public/c/${id}/m/${mid}`)}
        backTo={`/t/${handle}`}
        backLabel={data.teacher.name}
      />
    </ThemedShell>
  );
}

// ---------- Share links ----------

type ShareResponse = {
  status: 'ok' | 'passcode';
  wrong?: boolean;
  teacher: PublicTeacher;
  theme: Theme;
  language: Lang;
  label: string;
  type?: 'material' | 'collection' | 'page';
  handle?: string;
  material?: Material;
  access?: MaterialAccess;
  collection?: Collection;
  items?: CollectionItem[];
};

export function SharePage() {
  const { slug = '' } = useParams();
  const qc = useQueryClient();
  const storeKey = `studyhub.pass.${slug}`;
  const [passcode, setPasscode] = useState(() => sessionStorage.getItem(storeKey) ?? '');
  const headers = passcode ? { 'X-Passcode': passcode } : undefined;

  const query = useQuery({
    queryKey: ['share', slug, passcode],
    queryFn: async () => {
      try {
        return await api<ShareResponse>(`/api/public/s/${slug}`, { headers });
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403) && e.data?.status === 'passcode') return e.data as ShareResponse;
        throw e;
      }
    },
    retry: false,
  });
  const data = query.data;
  const [lang, setLang] = useLang(data?.language ?? 'bn');
  useTitle(data?.material?.title ?? data?.collection?.title ?? data?.label);

  if (query.isLoading) return <Loading />;
  if (query.error || !data) {
    const e = query.error as ApiError;
    return <Status title={e?.status === 410 ? '⌛' : t(lang, 'not_found')} message={e?.message} />;
  }
  if (data.status === 'passcode') {
    return (
      <PasscodeGate
        theme={data.theme}
        teacher={data.teacher}
        lang={lang}
        setLang={setLang}
        wrong={!!data.wrong}
        label={data.label}
        onSubmit={(code) => {
          sessionStorage.setItem(storeKey, code);
          setPasscode(code);
          qc.invalidateQueries({ queryKey: ['share', slug] });
        }}
      />
    );
  }
  if (data.type === 'page' && data.handle) return <Navigate to={`/t/${data.handle}`} replace />;

  return (
    <ThemedShell theme={data.theme} teacher={data.teacher} lang={lang} setLang={setLang} layout={{ width: data.type === 'collection' ? 'wide' : 'normal' }}>
      {data.type === 'material' && data.material && data.access && <MaterialView material={data.material} access={data.access} lang={lang} teacher={data.teacher} />}
      {data.type === 'collection' && data.collection && (
        <CollectionView
          collection={data.collection}
          items={data.items ?? []}
          lang={lang}
          progressKey={`s-${slug}`}
          loadItem={(mid) => api(`/api/public/s/${slug}/m/${mid}`, { headers })}
        />
      )}
    </ThemedShell>
  );
}

function PasscodeGate({
  theme,
  teacher,
  lang,
  setLang,
  wrong,
  label,
  onSubmit,
}: {
  theme: Theme;
  teacher: PublicTeacher;
  lang: Lang;
  setLang: (l: Lang) => void;
  wrong: boolean;
  label: string;
  onSubmit: (code: string) => void;
}) {
  const [code, setCode] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (code.trim()) onSubmit(code.trim());
  };
  return (
    <ThemedShell theme={theme} teacher={teacher} lang={lang} setLang={setLang} layout={{ width: 'narrow' }}>
      <form onSubmit={submit} className="tp-card mx-auto mt-12 max-w-sm p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: 'var(--tp-accent-soft)', color: 'var(--tp-primary)', border: '1.5px solid var(--tp-ink)' }}>
          <Lock className="h-6 w-6" />
        </div>
        <h1 className="tp-h text-xl font-bold">{label || t(lang, 'passcode_title')}</h1>
        <p className="tp-muted mt-1 text-sm">{t(lang, 'passcode_hint')}</p>
        <input autoFocus className="tp-input mt-5 text-center text-lg tracking-widest" style={{ borderColor: 'var(--tp-ink)' }} value={code} onChange={(e) => setCode(e.target.value)} inputMode="text" autoComplete="off" />
        {wrong && <p className="mt-2 text-sm font-medium text-red-600">{t(lang, 'wrong_passcode')}</p>}
        <button type="submit" className="tp-btn mt-5 w-full">
          {t(lang, 'unlock')}
        </button>
      </form>
    </ThemedShell>
  );
}
