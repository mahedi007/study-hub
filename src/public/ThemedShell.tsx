import { useEffect, type ReactNode, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import type { PageLayout, SiteInfo, Theme } from '../../shared/types';
import { ensureFonts } from '../lib/fonts';
import { themeStyle } from '../lib/theme';
import type { Lang } from '../lib/i18n';

export const WIDTHS: Record<PageLayout['width'], string> = {
  narrow: 'max-w-[860px]',
  normal: 'max-w-[1040px]',
  wide: 'max-w-7xl',
};

/** A link that does nothing inside the page designer preview. */
export function PLink({ to, preview, className, children, style, reload }: { to: string; preview?: boolean; className?: string; children: ReactNode; style?: React.CSSProperties; reload?: boolean }) {
  if (preview) {
    return (
      <a href={to} className={className} style={style} onClick={(e: MouseEvent) => e.preventDefault()}>
        {children}
      </a>
    );
  }
  // reload: a real page load (HTML lessons are standalone pages served by the server, not the app).
  if (reload) {
    return (
      <a href={to} className={className} style={style}>
        {children}
      </a>
    );
  }
  if (/^https?:\/\//.test(to) || to.startsWith('mailto:') || to.startsWith('tel:')) {
    return (
      <a href={to} className={className} style={style} target={to.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
        {children}
      </a>
    );
  }
  return (
    <Link to={to} className={className} style={style}>
      {children}
    </Link>
  );
}

export function LangToggle({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <button className="tp-muted text-sm font-semibold hover:underline" onClick={() => setLang(lang === 'bn' ? 'en' : 'bn')} aria-label="Change language">
      {lang === 'bn' ? 'English' : 'বাংলা'}
    </button>
  );
}

/** The "● Name" wordmark from the original site. */
export function Brand({ name, avatar }: { name: string; avatar?: string | null }) {
  return (
    <span className="tp-h flex items-center gap-2 text-xl font-bold">
      {avatar ? <img src={avatar} alt="" className="h-7 w-7 rounded-full object-cover" /> : <i className="inline-block h-3 w-3 rounded-full" style={{ background: 'var(--tp-accent)' }} />}
      {name}
    </span>
  );
}

export const DEFAULT_SITE: SiteInfo = { siteName: 'স্টাডি ম্যাটেরিয়ালস', brandName: 'Munjiba', logoUrl: null };

export function ThemedShell({
  theme,
  site = DEFAULT_SITE,
  lang,
  setLang,
  layout,
  preview,
  children,
  showHeader = true,
  siteLabel,
  footer = true,
}: {
  theme: Theme;
  site?: SiteInfo;
  lang: Lang;
  setLang: (l: Lang) => void;
  layout?: Partial<PageLayout>;
  preview?: boolean;
  children: ReactNode;
  showHeader?: boolean;
  siteLabel?: string;
  footer?: boolean;
}) {
  useEffect(() => ensureFonts([theme.font, theme.headingFont]), [theme.font, theme.headingFont]);
  useEffect(() => {
    if (preview) return;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.bg);
  }, [theme.bg, preview]);
  const width = WIDTHS[layout?.width ?? 'normal'];
  const headerStyle = layout?.headerStyle ?? 'brand';
  const label = siteLabel ?? site.siteName ?? (lang === 'bn' ? 'স্টাডি ম্যাটেরিয়ালস' : 'Study materials');
  // The brand always leads back to the single home page.
  const brand = (
    <PLink to="/" preview={preview} className="min-w-0" reload={false}>
      <Brand name={site.brandName || 'Munjiba'} avatar={site.logoUrl} />
    </PLink>
  );
  const right = (
    <div className="flex items-center gap-4 text-[15px]">
      <PLink to="/" preview={preview} className="tp-muted hidden hover:underline sm:inline">
        {label}
      </PLink>
      <LangToggle lang={lang} setLang={setLang} />
    </div>
  );

  return (
    <div className="tp-root" style={themeStyle(theme)} data-card={theme.cardStyle} data-btn={theme.buttonStyle} data-pattern={theme.pattern ?? 'none'}>
      {showHeader && headerStyle === 'brand' && (
        <header className={`mx-auto flex ${width} items-center justify-between gap-3 px-5 py-[18px]`}>
          {brand}
          {right}
        </header>
      )}
      {showHeader && (headerStyle === 'bar' || headerStyle === 'floating') && (
        <header
          className={headerStyle === 'floating' ? `sticky top-3 z-30 mx-auto mt-3 ${width} px-3` : 'sticky top-0 z-30 border-b tp-border backdrop-blur'}
          style={headerStyle === 'bar' ? { background: 'color-mix(in srgb, var(--tp-bg) 85%, transparent)' } : undefined}
        >
          <div className={`mx-auto flex items-center justify-between gap-3 ${headerStyle === 'floating' ? 'tp-card px-4 py-2.5' : `${width} px-5 py-3`}`}>
            {brand}
            {right}
          </div>
        </header>
      )}
      <main className={`mx-auto ${width} px-5 pb-10 ${showHeader && headerStyle !== 'none' ? 'pt-2' : 'pt-8'}`}>{children}</main>
      {footer && (
        <footer className="tp-muted pb-10 pt-6 text-center text-sm">
          ©2026 - Munjiba Miss
        </footer>
      )}
    </div>
  );
}
