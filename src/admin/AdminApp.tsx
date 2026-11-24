import { createContext, useContext, useState, type ReactNode } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ExternalLink,
  FileStack,
  Layers,
  LayoutDashboard,
  Link2,
  LogOut,
  Megaphone,
  Menu as MenuIcon,
  Palette,
  ScrollText,
  Settings,
  ShieldCheck,
  User as UserIcon,
  Users,
  X,
  HardDrive,
  AlertTriangle,
} from 'lucide-react';
import { adminApi, api } from '../lib/api';
import { LoginPage, InvitePage } from './AuthPages';
import type { Capabilities, SiteSettings, User } from '../../shared/types';
import { ConfirmProvider, PageLoader, Progress, cx } from '../components/ui';
import { formatBytes } from '../lib/format';
import Dashboard from './Dashboard';
import Materials from './Materials';
import MaterialEdit from './MaterialEdit';
import Collections from './Collections';
import CollectionEdit from './CollectionEdit';
import Links from './Links';
import Announcements from './Announcements';
import Profile from './Profile';
import PageDesigner from './designer/PageDesigner';
import Teachers from './system/Teachers';
import SiteSettingsPage from './system/SiteSettings';
import Storage from './system/Storage';
import Audit from './system/Audit';

export interface Me {
  user: User & { used_bytes: number; avatar_url: string | null };
  settings: SiteSettings;
  capabilities: Capabilities;
  signingKey: boolean;
  isSuperAdmin: boolean;
}

const MeCtx = createContext<Me | null>(null);
export const useMe = () => useContext(MeCtx)!;

function NavItem({ to, icon, children, end }: { to: string; icon: ReactNode; children: ReactNode; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cx('flex items-center gap-2.5 rounded-full px-3.5 py-2 text-[15px] font-semibold transition', isActive ? 'bg-gold text-green' : 'text-[#f4eee1]/80 hover:bg-white/10 hover:text-[#f4eee1]')
      }
    >
      {icon}
      {children}
    </NavLink>
  );
}

function Sidebar({ me, onNavigate }: { me: Me; onNavigate?: () => void }) {
  const ic = 'h-4 w-4';
  const qc = useQueryClient();
  const navigate = useNavigate();
  const unlimited = !me.user.quota_bytes;
  const pct = unlimited ? 0 : (me.user.used_bytes / me.user.quota_bytes) * 100;
  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST' });
    qc.clear();
    navigate('/admin/login', { replace: true });
  };
  return (
    <div className="flex h-full flex-col bg-green text-[#f4eee1]" onClick={onNavigate}>
      <div className="flex items-center gap-2.5 px-5 py-5">
        <i className="inline-block h-3 w-3 rounded-full bg-gold" />
        <div className="min-w-0">
          <div className="serif truncate text-lg font-bold leading-tight">{me.settings.siteName}</div>
          <div className="text-[13px] text-[#f4eee1]/60">{me.isSuperAdmin ? 'Super admin' : me.user.role === 'admin' ? 'Admin' : 'Teacher'} workspace</div>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
        <NavItem to="/admin" end icon={<LayoutDashboard className={ic} />}>Dashboard</NavItem>
        <NavItem to="/admin/materials" icon={<FileStack className={ic} />}>Materials</NavItem>
        <NavItem to="/admin/collections" icon={<Layers className={ic} />}>Collections</NavItem>
        <NavItem to="/admin/links" icon={<Link2 className={ic} />}>Share links</NavItem>
        <NavItem to="/admin/announcements" icon={<Megaphone className={ic} />}>Notices</NavItem>
        <NavItem to="/admin/profile" icon={<UserIcon className={ic} />}>Profile</NavItem>
        {me.user.role === 'admin' && (
          <>
            <div className="px-3.5 pb-1 pt-5 text-[11px] font-bold uppercase tracking-widest text-gold">Administration</div>
            <NavItem to="/admin/design" icon={<Palette className={ic} />}>Home page design</NavItem>
            <NavItem to="/admin/system/teachers" icon={<Users className={ic} />}>Teachers</NavItem>
            <NavItem to="/admin/system/materials" icon={<ShieldCheck className={ic} />}>All materials</NavItem>
            <NavItem to="/admin/system/storage" icon={<HardDrive className={ic} />}>Storage & usage</NavItem>
            <NavItem to="/admin/system/settings" icon={<Settings className={ic} />}>Site settings</NavItem>
            <NavItem to="/admin/system/audit" icon={<ScrollText className={ic} />}>Activity log</NavItem>
          </>
        )}
      </nav>
      <div className="space-y-3 border-t border-white/10 p-4">
        <div>
          <div className="mb-1 flex justify-between text-xs text-[#f4eee1]/70">
            <span>Storage</span>
            <span>
              {formatBytes(me.user.used_bytes)} {unlimited ? '· no limit' : `/ ${formatBytes(me.user.quota_bytes)}`}
            </span>
          </div>
          {!unlimited && <Progress value={pct} tone={pct > 90 ? 'red' : pct > 75 ? 'amber' : 'indigo'} className="bg-white/15" />}
        </div>
        <a href="/" target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm font-semibold text-gold hover:underline">
          <ExternalLink className="h-4 w-4" /> View the site
        </a>
        <div className="flex items-center gap-2">
          {me.user.avatar_url ? (
            <img src={me.user.avatar_url} alt="" className="h-9 w-9 rounded-full border-2 border-gold object-cover" />
          ) : (
            <span className="serif flex h-9 w-9 items-center justify-center rounded-full bg-gold text-sm font-bold text-green">{(me.user.name || '?').slice(0, 1).toUpperCase()}</span>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{me.user.name}</div>
            <div className="truncate text-xs text-[#f4eee1]/60">{me.user.email}</div>
          </div>
          <button onClick={logout} className="rounded-full p-2 text-[#f4eee1]/70 hover:bg-white/10 hover:text-[#f4eee1]" title="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function SetupWarnings({ me }: { me: Me }) {
  const items: string[] = [];
  if (!me.signingKey) items.push('SIGNING_KEY secret is missing — students cannot open uploaded files until it is set.');
  if (me.user.role === 'admin' && !me.capabilities.contentOrigin)
    items.push('CONTENT_ORIGIN is not set — HTML lessons are served from this site inside a strict sandbox (no localStorage). Deploy the content worker for full compatibility.');
  if (!items.length) return null;
  return (
    <div className="mb-6 space-y-2">
      {items.map((m) => (
        <div key={m} className="flex gap-2 rounded-xl border-[1.5px] border-ink bg-gold-soft px-3.5 py-2 text-sm text-ink">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {m}
        </div>
      ))}
    </div>
  );
}

export default function AdminApp() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route path="invite/:token" element={<InvitePage />} />
      <Route path="*" element={<Workspace />} />
    </Routes>
  );
}

function Workspace() {
  const { data, error, isLoading } = useQuery({ queryKey: ['me'], queryFn: () => adminApi<Me>('/me'), retry: false });
  const [drawer, setDrawer] = useState(false);
  const loc = useLocation();
  const fullBleed = loc.pathname.startsWith('/admin/design');

  if (isLoading) return <PageLoader />;
  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm">
          <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-stone-400" />
          <h1 className="text-lg font-semibold">Can't open the teacher workspace</h1>
          <p className="mt-2 text-sm text-stone-600">{(error as Error)?.message}</p>
          <a href="/admin/login" className="mt-5 inline-block text-sm font-medium text-indigo-600 hover:underline">
            Go to sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <MeCtx.Provider value={data}>
      <ConfirmProvider>
        <div className="flex min-h-screen">
          <aside className="sticky top-0 hidden h-screen w-64 shrink-0 lg:block">
            <Sidebar me={data} />
          </aside>
          {drawer && (
            <div className="fixed inset-0 z-50 flex bg-stone-900/40 lg:hidden" onClick={() => setDrawer(false)}>
              <aside className="h-full w-72 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <button className="absolute left-[16.5rem] top-3 rounded-full bg-white p-1.5 shadow" onClick={() => setDrawer(false)} aria-label="Close menu">
                  <X className="h-4 w-4" />
                </button>
                <Sidebar me={data} onNavigate={() => setDrawer(false)} />
              </aside>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="sticky top-0 z-30 flex items-center gap-3 bg-green px-4 py-3 text-[#f4eee1] lg:hidden">
              <button onClick={() => setDrawer(true)} className="rounded-full p-1 hover:bg-white/10" aria-label="Open menu">
                <MenuIcon className="h-5 w-5" />
              </button>
              <i className="inline-block h-2.5 w-2.5 rounded-full bg-gold" />
              <span className="serif font-bold">{data.settings.siteName}</span>
            </div>
            <div className={fullBleed ? '' : 'mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8'}>
              {!fullBleed && <SetupWarnings me={data} />}
              <Routes>
                <Route index element={<Dashboard />} />
                <Route path="materials" element={<Materials />} />
                <Route path="materials/:id" element={<MaterialEdit />} />
                <Route path="collections" element={<Collections />} />
                <Route path="collections/:id" element={<CollectionEdit />} />
                <Route path="links" element={<Links />} />
                <Route path="announcements" element={<Announcements />} />
                <Route path="profile" element={<Profile />} />
                {data.user.role === 'admin' && (
                  <>
                    <Route path="design" element={<PageDesigner />} />
                    <Route path="system/teachers" element={<Teachers />} />
                    <Route path="system/materials" element={<Materials scope="all" />} />
                    <Route path="system/storage" element={<Storage />} />
                    <Route path="system/settings" element={<SiteSettingsPage />} />
                    <Route path="system/audit" element={<Audit />} />
                  </>
                )}
                <Route path="*" element={<Dashboard />} />
              </Routes>
            </div>
          </div>
        </div>
      </ConfirmProvider>
    </MeCtx.Provider>
  );
}

