import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Download, Eye, EyeOff, FileStack, Grid2x2, List, MoreHorizontal, Pencil, Plus, Search, Share2, Trash2, Upload, Globe, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '../lib/api';
import type { Material } from '../../shared/types';
import { KIND_LABELS } from '../../shared/design';
import { Button, Card, EmptyState, Input, Menu, MenuItem, PageHeader, PageLoader, Select, StatusBadge, cx, useConfirm } from '../components/ui';
import { KindIcon, KIND_COLORS } from '../components/KindIcon';
import { copyText, formatBytes, timeAgo } from '../lib/format';
import NewMaterialDialog from './NewMaterialDialog';
import ShareDialog from './ShareDialog';
import { useMe } from './AdminApp';

export default function Materials({ scope }: { scope?: 'all' }) {
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  // Admins manage every teacher's materials here; teachers see their own.
  const showAll = scope === 'all' || me.user.role === 'admin';
  const key = ['materials'];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => adminApi<{ materials: Material[] }>('/materials') });

  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState('');
  const [subject, setSubject] = useState('');
  const [owner, setOwner] = useState(() => params.get('teacher') ?? '');
  const [view, setView] = useState<'table' | 'grid'>(() => (localStorage.getItem('studyhub.matview') as 'table' | 'grid') || 'table');
  const [selected, setSelected] = useState<string[]>([]);
  const [newOpen, setNewOpen] = useState(params.get('new') === '1');
  const [dropped, setDropped] = useState<File[] | undefined>();
  const [dragging, setDragging] = useState(false);
  const [share, setShare] = useState<Material | null>(null);

  useEffect(() => localStorage.setItem('studyhub.matview', view), [view]);
  useEffect(() => {
    if (params.get('new') === '1') {
      setNewOpen(true);
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const all = data?.materials ?? [];
  const subjects = useMemo(() => [...new Set(all.map((m) => m.subject).filter(Boolean))].sort(), [all]);
  const owners = useMemo(() => [...new Map(all.filter((m) => m.owner_email).map((m) => [m.owner_id, m.owner_name || m.owner_email])).entries()], [all]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter(
      (m) =>
        (!status || m.status === status) &&
        (!kind || m.kind === kind) &&
        (!subject || m.subject === subject) &&
        (!owner || m.owner_id === owner) &&
        (!needle || `${m.title} ${m.description} ${m.subject} ${m.class_level} ${m.tags.join(' ')} ${m.owner_name ?? ''}`.toLowerCase().includes(needle)),
    );
  }, [all, q, status, kind, subject, owner]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['materials'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['me'] });
  };

  const bulk = async (action: string) => {
    if (!selected.length) return;
    if (action === 'delete' && !(await confirm({ title: `Delete ${selected.length} materials?`, message: 'Files are removed from storage and share links stop working. This cannot be undone.', danger: true, confirmLabel: 'Delete' }))) return;
    try {
      const res = await adminApi<{ count: number }>('/materials/bulk', { method: 'POST', body: { ids: selected, action } });
      toast.success(`Updated ${res.count} materials`);
      setSelected([]);
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const remove = async (m: Material) => {
    if (!(await confirm({ title: `Delete “${m.title}”?`, message: 'The file is removed from storage and its share links stop working.', danger: true, confirmLabel: 'Delete' }))) return;
    await adminApi(`/materials/${m.id}`, { method: 'DELETE' });
    toast.success('Deleted');
    refresh();
  };

  const setOne = async (m: Material, body: Partial<Material>) => {
    await adminApi(`/materials/${m.id}`, { method: 'PATCH', body });
    refresh();
  };

  const publicUrl = (m: Material) => `${window.location.origin}/topic/${m.slug}`;

  const allSelected = list.length > 0 && list.every((m) => selected.includes(m.id));
  const toggleAll = () => setSelected(allSelected ? [] : list.map((m) => m.id));
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const actions = (m: Material) => (
    <Menu trigger={<button className="rounded-md p-1.5 text-stone-500 hover:bg-stone-100" aria-label="Actions"><MoreHorizontal className="h-4 w-4" /></button>}>
      <MenuItem icon={<Pencil className="h-4 w-4" />} onClick={() => navigate(`/admin/materials/${m.id}`)}>Edit</MenuItem>
      {m.owner_id === me.user.id && <MenuItem icon={<Share2 className="h-4 w-4" />} onClick={() => setShare(m)}>Share link…</MenuItem>}
      {m.status === 'published' && (
        <MenuItem icon={<Copy className="h-4 w-4" />} onClick={async () => { await copyText(publicUrl(m)); toast.success('Public link copied'); }}>Copy public link</MenuItem>
      )}
      {m.status !== 'published' ? (
        <MenuItem icon={<Globe className="h-4 w-4" />} onClick={() => setOne(m, { status: 'published' })}>Publish</MenuItem>
      ) : (
        <MenuItem icon={<EyeOff className="h-4 w-4" />} onClick={() => setOne(m, { status: 'unlisted' })}>Hide from page (link only)</MenuItem>
      )}
      <MenuItem icon={<Trash2 className="h-4 w-4" />} danger onClick={() => remove(m)}>Delete</MenuItem>
    </Menu>
  );

  if (isLoading) return <PageLoader />;

  return (
    <div
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); const files = Array.from(e.dataTransfer.files); if (files.length) { setDropped(files); setNewOpen(true); } }}
      className="relative"
    >
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-indigo-600/10 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-indigo-500 bg-white px-10 py-8 text-center shadow-xl">
            <Upload className="mx-auto mb-2 h-8 w-8 text-indigo-600" />
            <div className="font-semibold">Drop to upload</div>
          </div>
        </div>
      )}
      <PageHeader
        title="Materials"
        description={showAll ? 'Every teacher’s materials — edit, move to another teacher or delete anything. Tip: drag files anywhere on this page to upload.' : 'Upload, organise and share your study materials. Tip: drag files anywhere on this page.'}
        actions={<Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => { setDropped(undefined); setNewOpen(true); }}>Add material</Button>}
      />

      {!all.length ? (
        <EmptyState
          icon={<FileStack className="h-10 w-10" />}
          title="No materials yet"
          action={<Button variant="primary" icon={<Upload className="h-4 w-4" />} onClick={() => setNewOpen(true)}>Upload your first material</Button>}
        >
          PDFs, Word files, slides, audio, video, whole HTML folders, YouTube links or text notes.
        </EmptyState>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
              <Input placeholder="Search title, subject, tag…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
            </div>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto">
              <option value="">Any status</option>
              <option value="published">Published</option>
              <option value="unlisted">Link only</option>
              <option value="draft">Draft</option>
            </Select>
            <Select value={kind} onChange={(e) => setKind(e.target.value)} className="w-auto">
              <option value="">Any type</option>
              {Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v.en}</option>)}
            </Select>
            {subjects.length > 0 && (
              <Select value={subject} onChange={(e) => setSubject(e.target.value)} className="w-auto">
                <option value="">Any subject</option>
                {subjects.map((s) => <option key={s}>{s}</option>)}
              </Select>
            )}
            {showAll && (
              <Select value={owner} onChange={(e) => setOwner(e.target.value)} className="w-auto">
                <option value="">Any teacher</option>
                {owners.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </Select>
            )}
            <div className="flex rounded-lg border border-stone-300 bg-white p-0.5">
              <button className={cx('rounded-md p-1.5', view === 'table' && 'bg-stone-100')} onClick={() => setView('table')} aria-label="List view"><List className="h-4 w-4" /></button>
              <button className={cx('rounded-md p-1.5', view === 'grid' && 'bg-stone-100')} onClick={() => setView('grid')} aria-label="Grid view"><Grid2x2 className="h-4 w-4" /></button>
            </div>
          </div>

          {selected.length > 0 && (
            <div className="sticky top-16 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm lg:top-2">
              <b className="mr-2">{selected.length} selected</b>
              <Button size="sm" icon={<Globe className="h-3.5 w-3.5" />} onClick={() => bulk('published')}>Publish</Button>
              <Button size="sm" icon={<EyeOff className="h-3.5 w-3.5" />} onClick={() => bulk('unlisted')}>Link only</Button>
              <Button size="sm" icon={<Eye className="h-3.5 w-3.5" />} onClick={() => bulk('draft')}>Draft</Button>
              <Button size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={() => bulk('allow_download')}>Allow download</Button>
              <Button size="sm" icon={<Ban className="h-3.5 w-3.5" />} onClick={() => bulk('block_download')}>Block download</Button>
              <Button size="sm" variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => bulk('delete')}>Delete</Button>
              <button className="ml-auto text-xs text-stone-600 hover:underline" onClick={() => setSelected([])}>Clear</button>
            </div>
          )}

          {view === 'table' ? (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-stone-50 text-left text-xs text-stone-500">
                    <tr>
                      <th className="w-10 px-3 py-2.5"><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th>
                      <th className="px-2 py-2.5 font-medium">Title</th>
                      {showAll && <th className="px-2 py-2.5 font-medium">Teacher</th>}
                      <th className="hidden px-2 py-2.5 font-medium md:table-cell">Subject / class</th>
                      <th className="px-2 py-2.5 font-medium">Status</th>
                      <th className="hidden px-2 py-2.5 text-right font-medium sm:table-cell">Size</th>
                      <th className="hidden px-2 py-2.5 text-right font-medium sm:table-cell">Views</th>
                      <th className="hidden px-2 py-2.5 font-medium lg:table-cell">Updated</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {list.map((m) => (
                      <tr key={m.id} className={cx('hover:bg-stone-50/70', selected.includes(m.id) && 'bg-indigo-50/50')}>
                        <td className="px-3 py-2.5"><input type="checkbox" checked={selected.includes(m.id)} onChange={() => toggle(m.id)} /></td>
                        <td className="max-w-[320px] px-2 py-2.5">
                          <Link to={`/admin/materials/${m.id}`} className="flex items-center gap-2.5">
                            <KindIcon kind={m.kind} colored className="h-4 w-4 shrink-0" />
                            <span className="truncate font-medium hover:text-indigo-700">{m.title}</span>
                            {!m.ready && <span className="shrink-0 rounded bg-red-50 px-1.5 text-[10px] font-medium text-red-600">no file</span>}
                          </Link>
                        </td>
                        {showAll && <td className="px-2 py-2.5 text-stone-600">{m.owner_name || m.owner_email}{me.isSuperAdmin && m.owner_id === me.user.id && <span className="ml-1 text-xs text-amber-700">(you · not on site)</span>}</td>}
                        <td className="hidden px-2 py-2.5 text-stone-600 md:table-cell">{[m.subject, m.class_level].filter(Boolean).join(' · ') || '—'}</td>
                        <td className="px-2 py-2.5"><StatusBadge status={m.status} /></td>
                        <td className="hidden px-2 py-2.5 text-right tabular-nums text-stone-600 sm:table-cell">{m.size_bytes ? formatBytes(m.size_bytes) : '—'}</td>
                        <td className="hidden px-2 py-2.5 text-right tabular-nums text-stone-600 sm:table-cell">{m.view_count}</td>
                        <td className="hidden px-2 py-2.5 text-stone-500 lg:table-cell">{timeAgo(m.updated_at)}</td>
                        <td className="px-2 py-2.5">{actions(m)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!list.length && <p className="py-10 text-center text-sm text-stone-500">No materials match your filters.</p>}
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {list.map((m) => (
                <Card key={m.id} className={cx('group overflow-hidden', selected.includes(m.id) && 'ring-2 ring-indigo-500')}>
                  <Link to={`/admin/materials/${m.id}`} className="relative block aspect-[16/10]" style={{ background: `color-mix(in srgb, ${KIND_COLORS[m.kind]} 12%, white)` }}>
                    {m.cover_asset ? <img src={`/api/assets/${m.cover_asset}`} alt="" className="h-full w-full object-cover" /> : <KindIcon kind={m.kind} colored className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2" />}
                  </Link>
                  <div className="flex items-start gap-2 p-3">
                    <input type="checkbox" checked={selected.includes(m.id)} onChange={() => toggle(m.id)} className="mt-1" />
                    <div className="min-w-0 flex-1">
                      <Link to={`/admin/materials/${m.id}`} className="line-clamp-2 text-sm font-medium hover:text-indigo-700">{m.title}</Link>
                      <div className="mt-1.5 flex items-center gap-2 text-xs text-stone-500">
                        <StatusBadge status={m.status} />
                        <span>{m.view_count} views</span>
                      </div>
                      {showAll && <div className="mt-1 truncate text-xs text-stone-600">{m.owner_name || m.owner_email}</div>}
                    </div>
                    {actions(m)}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <NewMaterialDialog open={newOpen} onClose={() => { setNewOpen(false); setDropped(undefined); }} initialFiles={dropped} />
      {share && <ShareDialog open onClose={() => setShare(null)} targetType="material" targetId={share.id} title={share.title} />}
    </div>
  );
}
