import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { t, useLang, type Lang } from '../lib/i18n';
import { presetTheme, topicPath } from '../../shared/design';
import type { Collection, CollectionItem, Material, MaterialAccess, PageDesign, PublicPageData, PublicTeacher, SiteInfo, Theme } from '../../shared/types';
import { PageView } from './PageView';
import { PLink, ThemedShell } from './ThemedShell';
import { MaterialView } from './MaterialView';
import { CollectionView } from './CollectionView';

const DEFAULT_THEME = presetTheme('munjiba');

function useTitle(title?: string) {
  useEffect(() => {
    if (title) document.title = title;
  }, [title]);
}

function Status({ theme = DEFAULT_THEME, site, title, message, lang = 'bn' }: { theme?: Theme; site?: SiteInfo; title: string; message?: string; lang?: Lang }) {
  const [l, setL] = useLang(lang);
  return (
    <ThemedShell theme={theme} site={site} lang={l} setLang={setL} layout={{ width: 'narrow' }}>
      <div className="tp-card mx-auto mt-14 max-w-md p-10 text-center">
        <h1 className="tp-h text-3xl font-bold">{title}</h1>
        {message && <p className="tp-muted mt-2">{message}</p>}
        <PLink to="/" className="tp-btn mt-6">
          ← {l === 'bn' ? 'মূল পাতায় ফিরে যাও' : 'Back to home'}
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

// ---------- The single home page (all teachers' materials) ----------

export function HomePage() {
  const { data, error, isLoading } = useQuery({
    queryKey: ['home'],
    queryFn: () => api<{ design: PageDesign; data: PublicPageData }>('/api/public/home'),
  });
  const [lang, setLang] = useLang(data?.design.language ?? 'bn');
  useTitle(data ? data.design.seo.title || data.data.site.siteName : undefined);
  useEffect(() => {
    // Count one home-page visit per browser session for the admin dashboard.
    try {
      if (sessionStorage.getItem('sh_visit')) return;
      sessionStorage.setItem('sh_visit', '1');
    } catch {
      /* storage blocked: still count */
    }
    fetch('/api/public/visit', { method: 'POST', keepalive: true }).catch(() => undefined);
  }, []);
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

/** Old teacher pages (/t/<handle>) now open the home page filtered to that teacher. */
export function LegacyTeacherPage() {
  const { handle = '' } = useParams();
  return <Navigate to={`/?teacher=${encodeURIComponent(handle)}`} replace />;
}

/** Old material links (/t/<handle>/m/<id>) forward to /topic/<slug>. */
export function LegacyMaterialPage() {
  const { id = '' } = useParams();
  const { data, error } = useQuery({ queryKey: ['legacy-m', id], queryFn: () => api<{ slug: string }>(`/api/public/m/${id}`), retry: false });
  useEffect(() => {
    if (data?.slug) window.location.replace(`/topic/${data.slug}`);
  }, [data]);
  if (error) return <Status title="খুঁজে পাওয়া যায়নি" message={(error as Error).message} />;
  return <Loading />;
}

export function LegacyCollectionPage() {
  const { id = '' } = useParams();
  return <Navigate to={`/c/${id}`} replace />;
}

// ---------- /topic/<slug> ----------

type TopicResponse = { material: Material; access: MaterialAccess; teacher: PublicTeacher; theme: Theme; language: Lang; site: SiteInfo };

export function TopicPage() {
  const { slug = '' } = useParams();
  const { data, error, isLoading } = useQuery({ queryKey: ['topic', slug], queryFn: () => api<TopicResponse>(`/api/public/topic/${encodeURIComponent(slug)}`), staleTime: 10 * 60 * 1000 });
  const [lang, setLang] = useLang(data?.language ?? 'bn');
  useTitle(data?.material.title);

  // HTML lessons are standalone pages served by the server — load them for real (once, to avoid loops).
  useEffect(() => {
    if (data?.material.kind !== 'html' || !data.access.bundleUrl) return;
    const guard = `studyhub.topic-redirect.${slug}`;
    if (sessionStorage.getItem(guard)) return;
    sessionStorage.setItem(guard, '1');
    window.location.replace(data.access.bundleUrl);
  }, [data, slug]);

  if (isLoading) return <Loading />;
  if (error || !data) return <Status title={t(lang, 'not_found')} message={(error as Error)?.message} />;
  return (
    <ThemedShell theme={data.theme} site={data.site} lang={lang} setLang={setLang}>
      <MaterialView material={data.material} access={data.access} lang={lang} backTo="/" teacher={data.teacher} />
    </ThemedShell>
  );
}

// ---------- Collections ----------

type CollectionResponse = { collection: Collection; items: CollectionItem[]; teacher: PublicTeacher; theme: Theme; language: Lang; site: SiteInfo };

export function CollectionPage() {
  const { id = '' } = useParams();
  const { data, error, isLoading } = useQuery({ queryKey: ['pub-c', id], queryFn: () => api<CollectionResponse>(`/api/public/c/${id}`) });
  const [lang, setLang] = useLang(data?.language ?? 'bn');
  useTitle(data?.collection.title);
  if (isLoading) return <Loading />;
  if (error || !data) return <Status title={t(lang, 'not_found')} message={(error as Error)?.message} />;
  return (
    <ThemedShell theme={data.theme} site={data.site} lang={lang} setLang={setLang} layout={{ width: 'wide' }}>
      <CollectionView
        collection={data.collection}
        items={data.items}
        lang={lang}
        progressKey={`c-${id}`}
        loadItem={(mid) => api(`/api/public/c/${id}/m/${mid}`)}
        backTo="/"
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
  site: SiteInfo;
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
  const navigate = useNavigate();
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

  useEffect(() => {
    if (data?.status !== 'ok') return;
    if (data.type === 'page') navigate(data.handle ? `/?teacher=${encodeURIComponent(data.handle)}` : '/', { replace: true });
    // A shared HTML lesson opens as its own standalone page.
    if (data.type === 'material' && data.material?.kind === 'html' && data.access?.bundleUrl) window.location.replace(data.access.bundleUrl);
  }, [data, navigate]);

  if (query.isLoading) return <Loading />;
  if (query.error || !data) {
    const e = query.error as ApiError;
    return <Status title={e?.status === 410 ? '⌛' : t(lang, 'not_found')} message={e?.message} />;
  }
  if (data.status === 'passcode') {
    return (
      <PasscodeGate
        theme={data.theme}
        site={data.site}
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
  if (data.type === 'page') return <Loading theme={data.theme} />;

  return (
    <ThemedShell theme={data.theme} site={data.site} lang={lang} setLang={setLang} layout={{ width: data.type === 'collection' ? 'wide' : 'normal' }}>
      {data.type === 'material' && data.material && data.access && <MaterialView material={data.material} access={data.access} lang={lang} backTo="/" />}
      {data.type === 'collection' && data.collection && (
        <CollectionView
          collection={data.collection}
          items={data.items ?? []}
          lang={lang}
          progressKey={`s-${slug}`}
          loadItem={(mid) => api(`/api/public/s/${slug}/m/${mid}`, { headers })}
          backTo="/"
        />
      )}
    </ThemedShell>
  );
}

function PasscodeGate({
  theme,
  site,
  lang,
  setLang,
  wrong,
  label,
  onSubmit,
}: {
  theme: Theme;
  site: SiteInfo;
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
    <ThemedShell theme={theme} site={site} lang={lang} setLang={setLang} layout={{ width: 'narrow' }}>
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
        <PLink to="/" className="tp-muted mt-4 block text-sm font-semibold hover:underline">
          ← {lang === 'bn' ? 'মূল পাতায় ফিরে যাও' : 'Back to home'}
        </PLink>
      </form>
    </ThemedShell>
  );
}

export { topicPath };
