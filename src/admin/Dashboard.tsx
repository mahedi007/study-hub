import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Eye, FileStack, Layers, Link2, Palette, Plus, Upload, Megaphone, Globe } from 'lucide-react';
import { adminApi } from '../lib/api';
import type { Material } from '../../shared/types';
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
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: () => adminApi<Dash>('/dashboard') });
  if (isLoading || !data) return <PageLoader />;
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

function MaterialList({ title, items, showViews }: { title: string; items: Material[]; showViews?: boolean }) {
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
                <span className="flex-1 truncate text-sm">{m.title}</span>
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
