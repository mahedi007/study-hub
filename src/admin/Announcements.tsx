import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Pencil, Pin, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '../lib/api';
import type { Announcement } from '../../shared/types';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, PageLoader, Textarea, Toggle, useConfirm } from '../components/ui';
import { formatDate, fromDateInput, toDateInput } from '../lib/format';
import { renderMarkdown } from '../lib/markdown';

export default function Announcements() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data, isLoading } = useQuery({ queryKey: ['announcements'], queryFn: () => adminApi<{ announcements: Announcement[] }>('/announcements') });
  const [edit, setEdit] = useState<Partial<Announcement> | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!edit?.title?.trim()) return toast.error('Add a title');
    setBusy(true);
    try {
      const body = { title: edit.title, body_md: edit.body_md ?? '', pinned: !!edit.pinned, expires_at: edit.expires_at ?? null };
      if (edit.id) await adminApi(`/announcements/${edit.id}`, { method: 'PATCH', body });
      else await adminApi('/announcements', { method: 'POST', body });
      qc.invalidateQueries({ queryKey: ['announcements'] });
      qc.invalidateQueries({ queryKey: ['page-data'] });
      setEdit(null);
      toast.success('Notice saved — it shows on your page right away.');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) return <PageLoader />;
  const list = data?.announcements ?? [];
  return (
    <div>
      <PageHeader
        title="Notices"
        description="Announcements for your students. Add a “Notice board” block in the page designer to display them."
        actions={<Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({ title: '', body_md: '', pinned: false })}>New notice</Button>}
      />
      {!list.length ? (
        <EmptyState icon={<Megaphone className="h-10 w-10" />} title="No notices yet">Exam dates, homework reminders, class changes…</EmptyState>
      ) : (
        <div className="space-y-3">
          {list.map((a) => {
            const expired = !!a.expires_at && a.expires_at < Date.now();
            return (
              <Card key={a.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{a.title}</h3>
                      {a.pinned && <Badge tone="indigo"><Pin className="h-3 w-3" /> Pinned</Badge>}
                      {expired && <Badge tone="stone">Expired</Badge>}
                    </div>
                    <div className="text-xs text-stone-500">{formatDate(a.created_at)}{a.expires_at ? ` · until ${formatDate(a.expires_at)}` : ''}</div>
                    {a.body_md && <div className="tp-prose mt-2 text-sm text-stone-700" dangerouslySetInnerHTML={{ __html: renderMarkdown(a.body_md) }} />}
                  </div>
                  <Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEdit(a)} />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600"
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    onClick={async () => {
                      if (await confirm({ title: 'Delete notice?', danger: true, confirmLabel: 'Delete' })) {
                        await adminApi(`/announcements/${a.id}`, { method: 'DELETE' });
                        qc.invalidateQueries({ queryKey: ['announcements'] });
                      }
                    }}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit notice' : 'New notice'} footer={<><Button onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></>}>
        {edit && (
          <div className="space-y-3">
            <Field label="Title"><Input autoFocus value={edit.title ?? ''} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="e.g. Class test on Sunday" /></Field>
            <Field label="Details (Markdown)"><Textarea rows={5} value={edit.body_md ?? ''} onChange={(e) => setEdit({ ...edit, body_md: e.target.value })} /></Field>
            <div className="flex flex-wrap items-end gap-4">
              <Toggle checked={!!edit.pinned} onChange={(v) => setEdit({ ...edit, pinned: v })} label="Pin to top" />
              <Field label="Hide after (optional)"><Input type="date" value={toDateInput(edit.expires_at)} onChange={(e) => setEdit({ ...edit, expires_at: fromDateInput(e.target.value) })} /></Field>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
