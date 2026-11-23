import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../lib/api';
import type { User } from '../../../shared/types';
import { KIND_LABELS } from '../../../shared/design';
import { Card, PageHeader, PageLoader, Progress } from '../../components/ui';
import { KindIcon } from '../../components/KindIcon';
import { formatBytes } from '../../lib/format';

type S = {
  limit: number;
  used: number;
  byKind: { kind: keyof typeof KIND_LABELS; n: number; bytes: number }[];
  assets: { bytes: number; n: number };
  byUser: User[];
  totals: { materials: number; collections: number; links: number; users: number; views: number };
};

export default function Storage() {
  const { data, isLoading } = useQuery({ queryKey: ['storage'], queryFn: () => adminApi<S>('/system/storage') });
  if (isLoading || !data) return <PageLoader />;
  const pct = (data.used / data.limit) * 100;
  return (
    <div>
      <PageHeader title="Storage & usage" description="How much of Cloudflare's free tier the whole site is using." />
      <Card className="mb-6 p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="text-sm text-stone-500">R2 storage used</div>
            <div className="text-3xl font-semibold">{formatBytes(data.used)} <span className="text-base font-normal text-stone-500">of {formatBytes(data.limit)} free</span></div>
          </div>
          <div className="text-sm text-stone-500">{pct.toFixed(1)}%</div>
        </div>
        <Progress value={pct} className="mt-3 h-3" tone={pct > 90 ? 'red' : pct > 70 ? 'amber' : 'indigo'} />
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
          {Object.entries(data.totals).map(([k, v]) => (
            <div key={k} className="rounded-lg bg-stone-50 p-3"><div className="text-lg font-semibold tabular-nums">{Number(v).toLocaleString()}</div><div className="text-xs capitalize text-stone-500">{k}</div></div>
          ))}
        </div>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">By type</h2>
          <ul className="space-y-3">
            {data.byKind.map((k) => (
              <li key={k.kind}>
                <div className="mb-1 flex items-center gap-2 text-sm"><KindIcon kind={k.kind} colored className="h-4 w-4" /> <span className="flex-1">{KIND_LABELS[k.kind]?.en ?? k.kind} <span className="text-stone-400">({k.n})</span></span><span className="tabular-nums">{formatBytes(k.bytes)}</span></div>
                <Progress value={data.used ? (k.bytes / data.used) * 100 : 0} className="h-1.5" />
              </li>
            ))}
            <li>
              <div className="mb-1 flex items-center gap-2 text-sm"><span className="flex-1">Page images <span className="text-stone-400">({data.assets.n})</span></span><span className="tabular-nums">{formatBytes(data.assets.bytes)}</span></div>
              <Progress value={data.used ? (data.assets.bytes / data.used) * 100 : 0} className="h-1.5" />
            </li>
          </ul>
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">By teacher</h2>
          <ul className="space-y-3">
            {data.byUser.map((u) => (
              <li key={u.id}>
                <div className="mb-1 flex justify-between text-sm"><span className="truncate">{u.name || u.email}</span><span className="tabular-nums text-stone-500">{formatBytes(u.used_bytes ?? 0)} / {formatBytes(u.quota_bytes)}</span></div>
                <Progress value={u.quota_bytes ? ((u.used_bytes ?? 0) / u.quota_bytes) * 100 : 0} className="h-1.5" />
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <p className="mt-6 text-xs text-stone-500">Other free-tier limits to keep in mind: 100,000 API requests/day (Workers), 5 million D1 rows read and 100,000 rows written per day. Static pages and assets are unlimited.</p>
    </div>
  );
}
