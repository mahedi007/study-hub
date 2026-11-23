import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../lib/api';
import { Card, PageHeader, PageLoader } from '../../components/ui';
import { timeAgo } from '../../lib/format';

type Entry = { id: number; actor_email: string | null; action: string; target: string | null; meta: string | null; created_at: number };

export default function Audit() {
  const { data, isLoading } = useQuery({ queryKey: ['audit'], queryFn: () => adminApi<{ entries: Entry[] }>('/system/audit?limit=300') });
  if (isLoading) return <PageLoader />;
  return (
    <div>
      <PageHeader title="Activity log" description="Recent uploads, publishing, invites and settings changes." />
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs text-stone-500">
            <tr><th className="px-4 py-2.5 font-medium">When</th><th className="px-2 py-2.5 font-medium">Who</th><th className="px-2 py-2.5 font-medium">Action</th><th className="hidden px-2 py-2.5 font-medium md:table-cell">Details</th></tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {(data?.entries ?? []).map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap px-4 py-2 text-stone-500" title={new Date(e.created_at).toLocaleString()}>{timeAgo(e.created_at)}</td>
                <td className="px-2 py-2">{e.actor_email ?? '—'}</td>
                <td className="px-2 py-2"><code className="rounded bg-stone-100 px-1.5 py-0.5 text-xs">{e.action}</code></td>
                <td className="hidden max-w-md truncate px-2 py-2 font-mono text-xs text-stone-500 md:table-cell">{e.meta}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data?.entries.length && <p className="py-10 text-center text-sm text-stone-500">No activity yet.</p>}
      </Card>
    </div>
  );
}
