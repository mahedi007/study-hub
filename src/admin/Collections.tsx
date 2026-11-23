import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '../lib/api';
import type { Collection } from '../../shared/types';
import { Button, Card, EmptyState, Field, Input, Modal, PageHeader, PageLoader, StatusBadge, Textarea } from '../components/ui';
import { timeAgo } from '../lib/format';

export default function Collections() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ['collections'], queryFn: () => adminApi<{ collections: Collection[] }>('/collections') });
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!title.trim()) return toast.error('Give it a title');
    setBusy(true);
    try {
      const { collection } = await adminApi<{ collection: Collection }>('/collections', { method: 'POST', body: { title, description, status: 'published' } });
      qc.invalidateQueries({ queryKey: ['collections'] });
      navigate(`/admin/collections/${collection.id}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) return <PageLoader />;
  return (
    <div>
      <PageHeader
        title="Collections"
        description="Group materials into courses, chapters, weekly packs or playlists. Students get a table of contents with progress tracking."
        actions={<Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>New collection</Button>}
      />
      {!data?.collections.length ? (
        <EmptyState icon={<Layers className="h-10 w-10" />} title="No collections yet" action={<Button variant="primary" onClick={() => setOpen(true)}>Create a collection</Button>}>
          Example: “Class 5 Bangla — Week 8” with the reading PDF, audio, and practice worksheet in order.
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.collections.map((c) => (
            <Link key={c.id} to={`/admin/collections/${c.id}`}>
              <Card className="overflow-hidden transition hover:shadow-md">
                <div className="aspect-[16/8] bg-gradient-to-br from-indigo-500 to-violet-500">
                  {c.cover_asset && <img src={`/api/assets/${c.cover_asset}`} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold">{c.title}</h3>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="mt-1 text-xs text-stone-500">
                    {c.item_count ?? 0} items · {c.view_count} views · updated {timeAgo(c.updated_at)}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="New collection" footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" loading={busy} onClick={create}>Create</Button></>}>
        <div className="space-y-3">
          <Field label="Title"><Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. বাংলা ৫ম শ্রেণি — সপ্তাহ ৮" /></Field>
          <Field label="Description"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} /></Field>
        </div>
      </Modal>
    </div>
  );
}
