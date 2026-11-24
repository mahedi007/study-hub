import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Eye, FileStack, Layers, Link2, Palette, Plus, Upload, Megaphone, Globe, Users, HardDrive, Home, ExternalLink, UserPlus } from 'lucide-react';
import { adminApi } from '../lib/api';
import type { Material, MaterialKind } from '../../shared/types';
import { KIND_LABELS } from '../../shared/design';
import { Card, PageHeader, PageLoader, Progress, StatusBadge } from '../components/ui';
import { KindIcon } from '../components/KindIcon';
import { formatBytes, timeAgo } from '../lib/format';
import { useMe } from './AdminApp';

type Dash = {
  counts: { materials: number; published: number; collections: number; links: number; views: number };
  series: { day: string; views: number }[];
  top: Material[];
  recent: Material[];
  storage: { used: number; quota: number };
};

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number | string; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-stone-500">
        {icon} {label}
      </div>
      <div className="serif mt-1 text-3xl font-bold tabular-nums text-indigo-600">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-stone-500">{sub}</div>}
    </Card>
  );
}

export default function Dashboard() {
  const me = useMe();
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: () => adminApi<Dash | SiteDash>('/dashboard') });
  if (isLoading || !data) return <PageLoader />;
  if ('scope' in data && data.scope === 'site') return <SiteDashboard data={data} />;
  return <TeacherDashboard data={data as Dash} />;
}

function TeacherDashboard({ data }: { data: Dash }) {
  const me = useMe();
  const max = Math.max(1, ...data.series.map((s) => s.views));
  const week = data.series.slice(-7).reduce((s, d) => s + d.views, 0);
  const unlimited = !data.storage.quota;
  const pct = unlimited ? 0 : (data.storage.used / data.storage.quota) * 100;

  return (
    <div>
      <PageHeader
        title={`Hi ${me.user.name.split(' ')[0] || 'there'} 👋`}
        description="Here's what's happening with your materials."
        actions={
          <>
            {(me.isSuperAdmin || me.user.role === 'admin') && <Link to="/admin/design" className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-sm font-medium hover:bg-stone-50">
              <Palette className="h-4 w-4" /> Home page design
            </Link>}
            <Link to="/admin/materials?new=1" className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700">
              <Upload className="h-4 w-4" /> Upload material
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<FileStack className="h-4 w-4" />} label="Materials" value={data.counts.materials} sub={`${data.counts.published} published`} />
        <Stat icon={<Layers className="h-4 w-4" />} label="Collections" value={data.counts.collections} />
        <Stat icon={<Link2 className="h-4 w-4" />} label="Active links" value={data.counts.links} />
        <Stat icon={<Eye className="h-4 w-4" />} label="Total views" value={data.counts.views.toLocaleString()} sub={`${week} in the last 7 days`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="serif text-lg font-bold text-indigo-600">Views, last 14 days</h2>
          </div>
          <div className="flex h-40 items-end gap-1.5">
            {data.series.map((s) => (
              <div key={s.day} className="group relative flex flex-1 flex-col items-center justify-end">
                <div className="w-full rounded-t-md border-[1.5px] border-b-0 border-stone-900 bg-gold transition group-hover:bg-indigo-600" style={{ height: `${(s.views / max) * 100}%`, minHeight: s.views ? 4 : 2 }} />
                <span className="pointer-events-none absolute -top-6 hidden rounded bg-stone-800 px-1.5 py-0.5 text-[10px] text-white group-hover:block">{s.views}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-stone-400">
            <span>{data.series[0]?.day.slice(5)}</span>
            <span>Today</span>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="serif mb-3 text-lg font-bold text-indigo-600">Storage</h2>
          <div className="text-2xl font-semibold">{formatBytes(data.storage.used)}</div>
          <div className="mb-3 text-xs text-stone-500">{unlimited ? 'used · no storage limit' : `of ${formatBytes(data.storage.quota)} limit`}</div>
          {!unlimited && <Progress value={pct} tone={pct > 90 ? 'red' : pct > 75 ? 'amber' : 'indigo'} />}
          <p className="mt-3 text-xs text-stone-500">Tip: put long videos on YouTube (unlisted) and add them as an embed — they use no storage.</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link to="/admin/announcements" className="flex items-center gap-1.5 rounded-lg bg-stone-50 px-3 py-2 text-xs font-medium hover:bg-stone-100">
              <Megaphone className="h-3.5 w-3.5" /> Post notice
            </Link>
            <Link to="/admin/collections" className="flex items-center gap-1.5 rounded-lg bg-stone-50 px-3 py-2 text-xs font-medium hover:bg-stone-100">
              <Plus className="h-3.5 w-3.5" /> Collection
            </Link>
            <a href={me.user.handle && !me.isSuperAdmin ? `/?teacher=${me.user.handle}` : '/'} target="_blank" rel="noreferrer" className="col-span-2 flex items-center gap-1.5 rounded-lg bg-stone-50 px-3 py-2 text-xs font-medium hover:bg-stone-100">
              <Globe className="h-3.5 w-3.5" /> {me.isSuperAdmin ? 'View the site' : 'See my materials on the site'}
            </a>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <MaterialList title="Most viewed" items={data.top} showViews />
        <MaterialList title="Recently updated" items={data.recent} />
      </div>
    </div>
  );
}

function MaterialList({ title, items, showViews }: { title: string; items: (Material & { owner_name?: string })[]; showViews?: boolean }) {
  return (
    <Card>
      <h2 className="serif border-b-[1.5px] border-stone-200 px-5 py-3 text-lg font-bold text-indigo-600">{title}</h2>
      {!items.length ? (
        <p className="px-5 py-8 text-center text-sm text-stone-500">Nothing yet.</p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {items.map((m) => (
            <li key={m.id}>
              <Link to={`/admin/materials/${m.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-stone-50">
                <KindIcon kind={m.kind} colored className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{m.title}</span>
                  {m.owner_name && <span className="block truncate text-xs text-stone-500">{m.owner_name}</span>}
                </span>
                {showViews ? <span className="text-xs tabular-nums text-stone-500">{m.view_count} views</span> : <span className="text-xs text-stone-400">{timeAgo(m.updated_at)}</span>}
                <StatusBadge status={m.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

type SiteTeacher = {
  id: string; name: string; handle: string | null; status: string; super: boolean; avatar_url: string | null;
  last_login_at: number | null; last_upload: number | null; quota_bytes: number;
  materials: number; published: number; collections: number; links: number; views: number; used_bytes: number;
};
type SiteDash = {
  scope: 'site';
  counts: {
    materials: number; published: number; drafts: number; collections: number; links: number;
    material_views: number; collection_views: number; link_views: number; home_visits: number;
    teachers: number; pending: number; storage: number; views: number;
  };
  series: { day: string; views: number }[];
  visits: { day: string; views: number }[];
  top: (Material & { owner_name?: string })[];
  recent: (Material & { owner_name?: string })[];
  kinds: { kind: MaterialKind; count: number }[];
  teachers: SiteTeacher[];
  storage: { used: number; quota: number };
};

const sum = (xs: { views: number }[]) => xs.reduce((s, d) => s + d.views, 0);

function SiteDashboard({ data }: { data: SiteDash }) {
  const me = useMe();
  const c = data.counts;
  const week = sum(data.series.slice(-7));
  const weekVisits = sum(data.visits.slice(-7));
  const max = Math.max(1, ...data.series.map((s) => s.views), ...data.visits.map((s) => s.views));
  const pct = (data.storage.used / data.storage.quota) * 100;
  const kindMax = Math.max(1, ...data.kinds.map((k) => k.count));
  const teachers = data.teachers.filter((t) => !t.super);
  const mine = data.teachers.find((t) => t.super);

  return (
    <div>
      <PageHeader
        title={`Hi ${me.user.name.split(' ')[0] || 'there'} 👋`}
        description="The whole site at a glance — every teacher, material, view, link and byte of storage."
        actions={
          <>
            <Link to="/admin/system/teachers" className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-sm font-medium hover:bg-stone-50">
              <UserPlus className="h-4 w-4" /> Add teacher
            </Link>
            <Link to="/admin/design" className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-sm font-medium hover:bg-stone-50">
              <Palette className="h-4 w-4" /> Home page design
            </Link>
            <Link to="/admin/materials?new=1" className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700">
              <Upload className="h-4 w-4" /> Upload material
            </Link>
          </>
        }
      />

      {c.pending > 0 && (
        <Link to="/admin/system/teachers" className="mb-4 flex items-center gap-2 rounded-xl border-[1.5px] border-ink bg-gold-soft px-4 py-2.5 text-sm font-semibold">
          <Users className="h-4 w-4" /> {c.pending} teacher sign-up{c.pending > 1 ? 's' : ''} waiting for your approval →
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat icon={<Users className="h-4 w-4" />} label="Teachers" value={c.teachers} sub={c.pending ? `${c.pending} waiting` : 'active accounts'} />
        <Stat icon={<FileStack className="h-4 w-4" />} label="Materials" value={c.materials} sub={`${c.published} published · ${c.drafts} drafts`} />
        <Stat icon={<Layers className="h-4 w-4" />} label="Collections" value={c.collections} sub={`${c.collection_views.toLocaleString()} views`} />
        <Stat icon={<Link2 className="h-4 w-4" />} label="Share links" value={c.links} sub={`${c.link_views.toLocaleString()} opens`} />
        <Stat icon={<Eye className="h-4 w-4" />} label="Material views" value={c.material_views.toLocaleString()} sub={`${week.toLocaleString()} in 7 days`} />
        <Stat icon={<Home className="h-4 w-4" />} label="Home page visits" value={c.home_visits.toLocaleString()} sub={`${weekVisits.toLocaleString()} in 7 days`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="serif text-lg font-bold text-indigo-600">Last 30 days</h2>
            <div className="flex items-center gap-4 text-xs text-stone-600">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-stone-900 bg-gold" /> Material, collection & link views</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-stone-900 bg-indigo-600" /> Home page visits</span>
            </div>
          </div>
          <div className="flex h-44 items-end gap-[3px]">
            {data.series.map((s, i) => {
              const v = data.visits[i]?.views ?? 0;
              return (
                <div key={s.day} className="group relative flex h-full flex-1 items-end justify-center gap-px">
                  <div className="w-1/2 rounded-t-sm border border-b-0 border-stone-900 bg-gold" style={{ height: `${(s.views / max) * 100}%`, minHeight: s.views ? 3 : 1 }} />
                  <div className="w-1/2 rounded-t-sm border border-b-0 border-stone-900 bg-indigo-600" style={{ height: `${(v / max) * 100}%`, minHeight: v ? 3 : 1 }} />
                  <span className="pointer-events-none absolute -top-8 z-10 hidden whitespace-nowrap rounded bg-stone-800 px-1.5 py-0.5 text-[10px] text-white group-hover:block">
                    {s.day.slice(5)} · {s.views} views · {v} visits
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-stone-400">
            <span>{data.series[0]?.day.slice(5)}</span>
            <span>Today</span>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="serif mb-3 flex items-center gap-2 text-lg font-bold text-indigo-600"><HardDrive className="h-5 w-5" /> Storage</h2>
          <div className="text-2xl font-semibold">{formatBytes(data.storage.used)}</div>
          <div className="mb-3 text-xs text-stone-500">of {formatBytes(data.storage.quota)} free Cloudflare R2 · {pct.toFixed(1)}%</div>
          <Progress value={pct} tone={pct > 90 ? 'red' : pct > 75 ? 'amber' : 'indigo'} />
          <h3 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wider text-stone-500">Materials by type</h3>
          <ul className="space-y-1.5">
            {data.kinds.map((k) => (
              <li key={k.kind} className="flex items-center gap-2 text-xs">
                <KindIcon kind={k.kind} colored className="h-3.5 w-3.5 shrink-0" />
                <span className="w-20 truncate">{KIND_LABELS[k.kind]?.en ?? k.kind}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100"><span className="block h-full rounded-full bg-indigo-600" style={{ width: `${(k.count / kindMax) * 100}%` }} /></span>
                <span className="w-6 text-right tabular-nums text-stone-600">{k.count}</span>
              </li>
            ))}
            {!data.kinds.length && <li className="text-xs text-stone-500">No materials yet.</li>}
          </ul>
        </Card>
      </div>

      <Card className="mt-6 overflow-hidden">
        <div className="flex items-center justify-between border-b-[1.5px] border-stone-200 px-5 py-3">
          <h2 className="serif text-lg font-bold text-indigo-600">Teachers</h2>
          <Link to="/admin/system/teachers" className="text-sm font-semibold text-indigo-600 hover:underline">Manage →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs text-stone-600">
              <tr>
                <th className="px-5 py-2.5 font-semibold">Teacher</th>
                <th className="px-2 py-2.5 text-right font-semibold">Materials</th>
                <th className="hidden px-2 py-2.5 text-right font-semibold md:table-cell">Collections</th>
                <th className="hidden px-2 py-2.5 text-right font-semibold md:table-cell">Links</th>
                <th className="px-2 py-2.5 text-right font-semibold">Views</th>
                <th className="hidden px-2 py-2.5 text-right font-semibold sm:table-cell">Storage</th>
                <th className="hidden px-2 py-2.5 font-semibold lg:table-cell">Last upload</th>
                <th className="hidden px-2 py-2.5 font-semibold lg:table-cell">Last sign-in</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {[...teachers, ...(mine && mine.materials ? [mine] : [])].map((t) => (
                <tr key={t.id} className={t.status === 'disabled' ? 'opacity-60' : ''}>
                  <td className="px-5 py-2.5">
                    <Link to={`/admin/materials?teacher=${t.id}`} className="flex items-center gap-2.5 hover:text-indigo-700">
                      {t.avatar_url ? (
                        <img src={t.avatar_url} alt="" className="h-8 w-8 rounded-full border-[1.5px] border-stone-900 object-cover" />
                      ) : (
                        <span className="serif flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-gold">{(t.name || '?').slice(0, 1).toUpperCase()}</span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{t.name}{t.super && <span className="ml-1 text-xs font-normal text-amber-700">(you · not on site)</span>}</span>
                        {t.handle && <span className="block truncate text-xs text-stone-500">@{t.handle}</span>}
                      </span>
                    </Link>
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{t.materials}<span className="text-xs text-stone-400"> / {t.published} live</span></td>
                  <td className="hidden px-2 py-2.5 text-right tabular-nums md:table-cell">{t.collections}</td>
                  <td className="hidden px-2 py-2.5 text-right tabular-nums md:table-cell">{t.links}</td>
                  <td className="px-2 py-2.5 text-right font-semibold tabular-nums">{t.views.toLocaleString()}</td>
                  <td className="hidden px-2 py-2.5 text-right text-xs tabular-nums text-stone-600 sm:table-cell">{formatBytes(t.used_bytes)}{t.quota_bytes ? ` / ${formatBytes(t.quota_bytes)}` : ''}</td>
                  <td className="hidden px-2 py-2.5 text-xs text-stone-500 lg:table-cell">{t.last_upload ? timeAgo(t.last_upload) : '—'}</td>
                  <td className="hidden px-2 py-2.5 text-xs text-stone-500 lg:table-cell">{t.last_login_at ? timeAgo(t.last_login_at) : 'never'}</td>
                  <td className="px-2 py-2.5">
                    {t.handle && !t.super && (
                      <a href={`/?teacher=${t.handle}`} target="_blank" rel="noreferrer" className="inline-flex rounded-full p-1.5 text-stone-500 hover:bg-stone-100" title="See on the site">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!teachers.length && <p className="px-5 py-8 text-center text-sm text-stone-500">No teachers yet. <Link to="/admin/system/teachers" className="font-semibold text-indigo-600 underline">Add one</Link>.</p>}
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <MaterialList title="Most viewed (all teachers)" items={data.top} showViews />
        <MaterialList title="Recently updated (all teachers)" items={data.recent} />
      </div>
    </div>
  );
}
