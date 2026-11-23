import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowLeft, ExternalLink, GripVertical, Plus, Save, Share2, Trash2, X, Heading } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '../lib/api';
import type { Collection, CollectionItem, Material, Status } from '../../shared/types';
import { Button, Card, EmptyState, Field, Input, PageLoader, Select, StatusBadge, Textarea, useConfirm } from '../components/ui';
import { ImagePicker } from '../components/ImagePicker';
import { KindIcon } from '../components/KindIcon';
import { MaterialPicker } from '../components/MaterialPicker';
import ShareDialog from './ShareDialog';
import { useMe } from './AdminApp';

type Row = { material_id: string; section: string; material: Material };

function SortableRow({ row, sections, onSection, onRemove }: { row: Row; sections: string[]; onSection: (v: string) => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.material_id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined }} className={`flex items-center gap-2 bg-white px-2 py-2 ${isDragging ? 'shadow-lg ring-1 ring-indigo-200' : ''}`}>
      <button {...attributes} {...listeners} className="cursor-grab rounded p-1 text-stone-400 hover:bg-stone-100 active:cursor-grabbing" aria-label="Drag to reorder">
        <GripVertical className="h-4 w-4" />
      </button>
      <KindIcon kind={row.material.kind} colored className="h-4 w-4 shrink-0" />
      <Link to={`/admin/materials/${row.material_id}`} className="min-w-0 flex-1 truncate text-sm hover:text-indigo-700">{row.material.title}</Link>
      {row.material.status === 'draft' && <span className="hidden text-[10px] text-amber-700 sm:inline">draft — hidden from students</span>}
      <input
        list="section-names"
        value={row.section}
        onChange={(e) => onSection(e.target.value)}
        placeholder="Section"
        className="w-32 rounded-md border border-stone-200 px-2 py-1 text-xs focus:border-indigo-400 focus:outline-none sm:w-44"
      />
      <datalist id="section-names">{sections.map((s) => <option key={s} value={s} />)}</datalist>
      <button onClick={onRemove} className="rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove from collection"><X className="h-4 w-4" /></button>
    </div>
  );
}

export default function CollectionEdit() {
  const { id = '' } = useParams();
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { data, isLoading, refetch } = useQuery({ queryKey: ['collection', id], queryFn: () => adminApi<{ collection: Collection; items: CollectionItem[] }>(`/collections/${id}`) });
  const [meta, setMeta] = useState({ title: '', description: '', status: 'draft' as Status, cover_asset: null as string | null });
  const [rows, setRows] = useState<Row[]>([]);
  const [picker, setPicker] = useState(false);
  const [share, setShare] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  useEffect(() => {
    if (!data) return;
    setMeta({ title: data.collection.title, description: data.collection.description, status: data.collection.status, cover_asset: data.collection.cover_asset });
    setRows(data.items.map((i) => ({ material_id: i.material_id, section: i.section, material: i.material! })));
    setDirty(false);
  }, [data]);

  const sections = useMemo(() => [...new Set(rows.map((r) => r.section).filter(Boolean))], [rows]);

  if (isLoading || !data) return <PageLoader />;
  const c = data.collection;
  const touch = () => setDirty(true);

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setRows((r) => arrayMove(r, r.findIndex((x) => x.material_id === active.id), r.findIndex((x) => x.material_id === over.id)));
    touch();
  };

  const save = async () => {
    setSaving(true);
    try {
      await Promise.all([
        adminApi(`/collections/${c.id}`, { method: 'PATCH', body: meta }),
        adminApi(`/collections/${c.id}/items`, { method: 'PUT', body: { items: rows.map((r) => ({ material_id: r.material_id, section: r.section })) } }),
      ]);
      toast.success('Collection saved');
      qc.invalidateQueries({ queryKey: ['collections'] });
      await refetch();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!(await confirm({ title: 'Delete this collection?', message: 'The materials inside are kept. Share links to this collection stop working.', danger: true, confirmLabel: 'Delete' }))) return;
    await adminApi(`/collections/${c.id}`, { method: 'DELETE' });
    qc.invalidateQueries({ queryKey: ['collections'] });
    navigate('/admin/collections');
  };

  const addSection = () => {
    const name = window.prompt('Section name (applies to all items without a section at the end of the list)');
    if (!name) return;
    setRows((r) => {
      const copy = [...r];
      for (let i = copy.length - 1; i >= 0 && !copy[i].section; i--) copy[i] = { ...copy[i], section: name };
      return copy;
    });
    touch();
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link to="/admin/collections" className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100" aria-label="Back"><ArrowLeft className="h-5 w-5" /></Link>
        <h1 className="min-w-0 flex-1 truncate text-xl font-semibold">{c.title}</h1>
        <StatusBadge status={c.status} />
        {c.status === 'published' && me.user.handle && (
          <a href={`/t/${me.user.handle}/c/${c.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium hover:bg-stone-50"><ExternalLink className="h-4 w-4" /> Open</a>
        )}
        <Button icon={<Share2 className="h-4 w-4" />} onClick={() => setShare(true)}>Share</Button>
        <Button variant="primary" icon={<Save className="h-4 w-4" />} loading={saving} disabled={!dirty} onClick={save}>Save</Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
            <h2 className="font-semibold">Items <span className="text-sm font-normal text-stone-500">({rows.length})</span></h2>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" icon={<Heading className="h-3.5 w-3.5" />} onClick={addSection} disabled={!rows.length}>Section</Button>
              <Button size="sm" variant="soft" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setPicker(true)}>Add materials</Button>
            </div>
          </div>
          {!rows.length ? (
            <div className="p-4"><EmptyState title="Empty collection" action={<Button variant="primary" onClick={() => setPicker(true)}>Add materials</Button>}>Add materials, then drag them into the order students should follow.</EmptyState></div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={rows.map((r) => r.material_id)} strategy={verticalListSortingStrategy}>
                <div className="divide-y divide-stone-100">
                  {rows.map((r, i) => (
                    <div key={r.material_id}>
                      {r.section && r.section !== rows[i - 1]?.section && <div className="bg-stone-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">{r.section}</div>}
                      <SortableRow
                        row={r}
                        sections={sections}
                        onSection={(v) => { setRows((all) => all.map((x) => (x.material_id === r.material_id ? { ...x, section: v } : x))); touch(); }}
                        onRemove={() => { setRows((all) => all.filter((x) => x.material_id !== r.material_id)); touch(); }}
                      />
                    </div>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </Card>

        <Card className="h-fit space-y-4 p-5">
          <Field label="Title"><Input value={meta.title} onChange={(e) => { setMeta({ ...meta, title: e.target.value }); touch(); }} /></Field>
          <Field label="Description"><Textarea value={meta.description} onChange={(e) => { setMeta({ ...meta, description: e.target.value }); touch(); }} rows={4} /></Field>
          <Field label="Visibility">
            <Select value={meta.status} onChange={(e) => { setMeta({ ...meta, status: e.target.value as Status }); touch(); }}>
              <option value="published">Published — shown on my page</option>
              <option value="unlisted">Link only — via share links</option>
              <option value="draft">Draft</option>
            </Select>
          </Field>
          <ImagePicker label="Cover image" value={meta.cover_asset} onChange={(v) => { setMeta({ ...meta, cover_asset: v }); touch(); }} />
          <p className="text-xs text-stone-500">Materials marked “Link only” still open inside this collection, so you can keep them off your main page.</p>
          <Button variant="ghost" className="text-red-600" icon={<Trash2 className="h-4 w-4" />} onClick={remove}>Delete collection</Button>
        </Card>
      </div>

      <MaterialPicker
        open={picker}
        onClose={() => setPicker(false)}
        exclude={rows.map((r) => r.material_id)}
        onPick={(ms) => { setRows((r) => [...r, ...ms.map((m) => ({ material_id: m.id, section: r[r.length - 1]?.section ?? '', material: m }))]); touch(); }}
      />
      {share && <ShareDialog open onClose={() => setShare(false)} targetType="collection" targetId={c.id} title={c.title} />}
    </div>
  );
}
