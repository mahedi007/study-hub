import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Search, Globe } from 'lucide-react';
import { adminApi } from '../lib/api';
import type { ShareLink } from '../../shared/types';
import { Button, EmptyState, Input, PageHeader, PageLoader, Select } from '../components/ui';
import { LinkRow } from './ShareDialog';
import ShareDialog from './ShareDialog';
import { useMe } from './AdminApp';

export default function Links() {
  const me = useMe();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['links'], queryFn: () => adminApi<{ links: ShareLink[] }>('/links') });
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [pageShare, setPageShare] = useState(false);
  const list = useMemo(() => {
    const needle = q.toLowerCase();
    return (data?.links ?? []).filter((l) => (!type || l.target_type === type) && (!needle || `${l.label} ${l.slug} ${l.target_title}`.toLowerCase().includes(needle)));
  }, [data, q, type]);

  if (isLoading) return <PageLoader />;
  return (
    <div>
      <PageHeader
        title="Share links"
        description="Every link you have created, with opens, passcodes and expiry."
        actions={<Button icon={<Globe className="h-4 w-4" />} onClick={() => setPageShare(true)}>Link to my page</Button>}
      />
      {!data?.links.length ? (
        <EmptyState icon={<Link2 className="h-10 w-10" />} title="No share links yet">
          Open any material or collection and choose “Share” to create a link for your students.
        </EmptyState>
      ) : (
        <>
          <div className="mb-4 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search links" className="pl-9" />
            </div>
            <Select value={type} onChange={(e) => setType(e.target.value)} className="w-auto">
              <option value="">All types</option>
              <option value="material">Materials</option>
              <option value="collection">Collections</option>
              <option value="page">My page</option>
            </Select>
          </div>
          <div className="space-y-4">
            {list.map((l) => (
              <div key={l.id}>
                <div className="mb-1 text-xs font-medium text-stone-500">
                  {l.target_type === 'page' ? 'My public page' : (
                    <Link to={l.target_type === 'material' ? `/admin/materials/${l.target_id}` : `/admin/collections/${l.target_id}`} className="hover:text-indigo-700 hover:underline">
                      {l.target_type === 'material' ? 'Material' : 'Collection'}: {l.target_title ?? '(deleted)'}
                    </Link>
                  )}
                </div>
                <LinkRow link={l} onChange={() => qc.invalidateQueries({ queryKey: ['links'] })} />
              </div>
            ))}
          </div>
        </>
      )}
      {pageShare && <ShareDialog open onClose={() => setPageShare(false)} targetType="page" targetId={me.user.id} title="My public page" />}
    </div>
  );
}
