import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowLeft,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Laptop,
  Monitor,
  Plus,
  Redo2,
  RotateCcw,
  Rocket,
  Smartphone,
  Tablet,
  Trash2,
  Undo2,
  ExternalLink,
  Check,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '../../lib/api';
import type { Block, BlockType, Collection, PageDesign, PublicPageData } from '../../../shared/types';
import { BLOCK_LABELS, blockId, defaultDesign, newBlock, normalizeDesign } from '../../../shared/design';
import { Button, Field, Input, Modal, PageLoader, Select, Tabs, Textarea, cx, useConfirm } from '../../components/ui';
import { PageView } from '../../public/PageView';
import { BlockEditor } from './BlockEditor';
import { ThemePanel } from './ThemePanel';
import { useMe } from '../AdminApp';
import { formatDate } from '../../lib/format';
import type { Lang } from '../../lib/i18n';

// ---------- Undo/redo history ----------

type Hist = { past: PageDesign[]; present: PageDesign; future: PageDesign[]; lastKey?: string; lastAt: number };
type Action = { type: 'set'; design: PageDesign; key?: string } | { type: 'undo' } | { type: 'redo' } | { type: 'reset'; design: PageDesign };

function reducer(s: Hist, a: Action): Hist {
  switch (a.type) {
    case 'reset':
      return { past: [], present: a.design, future: [], lastAt: 0 };
    case 'set': {
      const now = Date.now();
      // Consecutive edits to the same field within 1s become one undo step (typing, sliders, color pickers).
      if (a.key && a.key === s.lastKey && now - s.lastAt < 1000) return { ...s, present: a.design, future: [], lastAt: now };
      return { past: [...s.past.slice(-60), s.present], present: a.design, future: [], lastKey: a.key, lastAt: now };
    }
    case 'undo':
      if (!s.past.length) return s;
      return { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future], lastAt: 0 };
    case 'redo':
      if (!s.future.length) return s;
      return { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1), lastAt: 0 };
  }
}

// ---------- Preview iframe (so mobile/tablet widths use real breakpoints) ----------

function FramePreview({ width, children, onDoc }: { width: number | '100%'; children: ReactNode; onDoc: (d: Document) => void }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const iframe = ref.current;
    if (!iframe) return;
    const d = iframe.contentDocument;
    if (!d) return;
    d.open();
    d.write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"></body></html>');
    d.close();
    const mirror = () => {
      d.head.querySelectorAll('[data-mirror]').forEach((n) => n.remove());
      document.head.querySelectorAll('style, link[rel="stylesheet"]').forEach((n) => {
        const c = n.cloneNode(true) as HTMLElement;
        c.setAttribute('data-mirror', '');
        d.head.appendChild(c);
      });
    };
    mirror();
    const mo = new MutationObserver(mirror);
    mo.observe(document.head, { childList: true, subtree: true, characterData: true });
    setBody(d.body);
    onDoc(d);
    return () => mo.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <iframe
      ref={ref}
      title="Page preview"
      className="h-full rounded-xl border border-stone-300 bg-white shadow-xl transition-[width] duration-300"
      style={{ width, maxWidth: '100%' }}
    >
      {body && createPortal(children, body)}
    </iframe>
  );
}

// ---------- Sortable block row ----------

function BlockRow({
  block,
  open,
  onToggleOpen,
  onChange,
  onDuplicate,
  onRemove,
  children,
}: {
  block: Block;
  open: boolean;
  onToggleOpen: () => void;
  onChange: (b: Block) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const label = BLOCK_LABELS[block.type].label;
  const sub = 'heading' in block && block.heading ? block.heading : 'title' in block ? block.title : '';
  return (
    <li
      ref={setNodeRef}
      id={`row-${block.id}`}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : undefined }}
      className={cx('rounded-xl border bg-white', open ? 'border-indigo-300 shadow-sm' : 'border-stone-200', isDragging && 'shadow-lg', !block.visible && 'opacity-60')}
    >
      <div className="flex items-center gap-1 px-1.5 py-1.5">
        <button {...attributes} {...listeners} className="cursor-grab rounded p-1 text-stone-400 hover:bg-stone-100 active:cursor-grabbing" aria-label="Drag to reorder">
          <GripVertical className="h-4 w-4" />
        </button>
        <button onClick={onToggleOpen} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{label}</div>
            {sub && <div className="truncate text-xs text-stone-500">{sub}</div>}
          </div>
          <ChevronDown className={cx('h-4 w-4 text-stone-400 transition', open && 'rotate-180')} />
        </button>
        <button onClick={() => onChange({ ...block, visible: !block.visible })} className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700" title={block.visible ? 'Hide' : 'Show'}>
          {block.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
        <button onClick={onDuplicate} className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700" title="Duplicate"><Copy className="h-4 w-4" /></button>
        <button onClick={onRemove} className="rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-600" title="Delete"><Trash2 className="h-4 w-4" /></button>
      </div>
      {open && <div className="border-t border-stone-100 p-3">{children}</div>}
    </li>
  );
}

const DEVICES = [
  { id: 'desktop', icon: Monitor, width: '100%' as const },
  { id: 'laptop', icon: Laptop, width: 1024 },
  { id: 'tablet', icon: Tablet, width: 768 },
  { id: 'mobile', icon: Smartphone, width: 390 },
];

export default function PageDesigner() {
  const me = useMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const designQ = useQuery({ queryKey: ['design'], queryFn: () => adminApi<{ draft: PageDesign; published: PageDesign | null; published_at: number | null; handle: string }>('/design') });
  const dataQ = useQuery({ queryKey: ['page-data'], queryFn: () => adminApi<PublicPageData>('/page-data') });
  const colsQ = useQuery({ queryKey: ['collections'], queryFn: () => adminApi<{ collections: Collection[] }>('/collections') });

  const [hist, dispatch] = useReducer(reducer, { past: [], present: defaultDesign(), future: [], lastAt: 0 });
  const design = hist.present;
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<'blocks' | 'theme' | 'settings'>('blocks');
  const [openId, setOpenId] = useState<string | null>(null);
  const [device, setDevice] = useState('desktop');
  const [addOpen, setAddOpen] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved');
  const [publishing, setPublishing] = useState(false);
  const [previewLang, setPreviewLang] = useState<Lang>('bn');
  const [publishedAt, setPublishedAt] = useState<number | null>(null);
  const frameDoc = useRef<Document | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    if (designQ.data && !loaded) {
      dispatch({ type: 'reset', design: normalizeDesign(designQ.data.draft, me.user.name) });
      setPublishedAt(designQ.data.published_at);
      setPreviewLang(designQ.data.draft.language);
      setLoaded(true);
    }
  }, [designQ.data, loaded, me.user.name]);

  // Autosave the draft shortly after each change.
  const first = useRef(true);
  useEffect(() => {
    if (!loaded) return;
    if (first.current) {
      first.current = false;
      return;
    }
    setSaveState('dirty');
    const t = setTimeout(async () => {
      setSaveState('saving');
      try {
        await adminApi('/design', { method: 'PUT', body: { design } });
        setSaveState('saved');
      } catch {
        setSaveState('error');
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [design, loaded]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      } else if (e.key.toLowerCase() === 'y') {
        e.preventDefault();
        dispatch({ type: 'redo' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (saveState === 'dirty' || saveState === 'saving') e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saveState]);

  const set = useCallback((d: PageDesign, key?: string) => dispatch({ type: 'set', design: d, key }), []);
  const updateBlock = (b: Block, key?: string) => set({ ...design, blocks: design.blocks.map((x) => (x.id === b.id ? b : x)) }, key);

  const selectBlock = (id: string) => {
    setTab('blocks');
    setOpenId(id);
    setTimeout(() => document.getElementById(`row-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  };

  const toggleOpen = (id: string) => {
    const next = openId === id ? null : id;
    setOpenId(next);
    if (next) frameDoc.current?.getElementById(`blk-${next}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const addBlock = (type: BlockType) => {
    const b = newBlock(type);
    const idx = openId ? design.blocks.findIndex((x) => x.id === openId) + 1 : design.blocks.length;
    const blocks = [...design.blocks];
    blocks.splice(idx, 0, b);
    set({ ...design, blocks });
    setAddOpen(false);
    setOpenId(b.id);
    setTimeout(() => frameDoc.current?.getElementById(`blk-${b.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = design.blocks.findIndex((b) => b.id === active.id);
    const to = design.blocks.findIndex((b) => b.id === over.id);
    set({ ...design, blocks: arrayMove(design.blocks, from, to) });
  };

  const publish = async () => {
    setPublishing(true);
    try {
      const res = await adminApi<{ published_at: number }>('/design/publish', { method: 'POST', body: { design } });
      setPublishedAt(res.published_at);
      setSaveState('saved');
      qc.invalidateQueries({ queryKey: ['page'] });
      toast.success('The home page is live!', { action: { label: 'View', onClick: () => window.open('/', '_blank') } });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPublishing(false);
    }
  };

  const revert = async () => {
    if (!designQ.data?.published) return toast.error('Nothing published yet');
    if (!(await confirm({ title: 'Discard draft changes?', message: 'Your draft is replaced with the currently published page.', confirmLabel: 'Revert', danger: true }))) return;
    dispatch({ type: 'reset', design: normalizeDesign(designQ.data.published, me.user.name) });
  };

  const previewData = useMemo<PublicPageData | null>(() => {
    if (!dataQ.data) return null;
    return dataQ.data;
  }, [dataQ.data]);

  if (designQ.isLoading || dataQ.isLoading || !loaded || !previewData) return <PageLoader />;

  const deviceWidth = DEVICES.find((d) => d.id === device)!.width;
  const saveLabel =
    saveState === 'saving' ? (
      <span className="flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</span>
    ) : saveState === 'dirty' ? (
      'Unsaved changes'
    ) : saveState === 'error' ? (
      <span className="text-red-600">Save failed</span>
    ) : (
      <span className="flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Draft saved</span>
    );

  return (
    <div className="flex h-screen flex-col bg-stone-100">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 bg-white px-3 py-2">
        <Link to="/admin" className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100" aria-label="Back"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="mr-2">
          <div className="text-sm font-semibold">Home page design</div>
          <div className="text-[11px] text-stone-500">{publishedAt ? `Live since ${formatDate(publishedAt)}` : 'Not published yet'}</div>
        </div>
        <div className="flex items-center rounded-lg border border-stone-200 p-0.5">
          <button className="rounded-md p-1.5 hover:bg-stone-100 disabled:opacity-30" disabled={!hist.past.length} onClick={() => dispatch({ type: 'undo' })} title="Undo (Ctrl+Z)"><Undo2 className="h-4 w-4" /></button>
          <button className="rounded-md p-1.5 hover:bg-stone-100 disabled:opacity-30" disabled={!hist.future.length} onClick={() => dispatch({ type: 'redo' })} title="Redo (Ctrl+Shift+Z)"><Redo2 className="h-4 w-4" /></button>
        </div>
        <div className="hidden items-center rounded-lg border border-stone-200 p-0.5 md:flex">
          {DEVICES.map((d) => (
            <button key={d.id} onClick={() => setDevice(d.id)} className={cx('rounded-md p-1.5', device === d.id ? 'bg-indigo-50 text-indigo-700' : 'text-stone-500 hover:bg-stone-100')} title={d.id}>
              <d.icon className="h-4 w-4" />
            </button>
          ))}
        </div>
        <div className="hidden text-xs text-stone-500 sm:block">{saveLabel}</div>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={revert} disabled={!designQ.data?.published}>Revert</Button>
          <a href="/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs font-medium hover:bg-stone-50">
            <ExternalLink className="h-3.5 w-3.5" /> Live page
          </a>
          <Button size="sm" variant="primary" icon={<Rocket className="h-3.5 w-3.5" />} loading={publishing} onClick={publish}>Publish</Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Editor panel */}
        <aside className="flex max-h-[50vh] w-full shrink-0 flex-col border-b border-stone-200 bg-stone-50 lg:max-h-none lg:w-[380px] lg:border-b-0 lg:border-r">
          <div className="p-3">
            <Tabs value={tab} onChange={setTab} tabs={[{ id: 'blocks', label: 'Blocks' }, { id: 'theme', label: 'Theme' }, { id: 'settings', label: 'Settings' }]} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
            {tab === 'blocks' && (
              <>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                  <SortableContext items={design.blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                    <ul className="space-y-2">
                      {design.blocks.map((b) => (
                        <BlockRow
                          key={b.id}
                          block={b}
                          open={openId === b.id}
                          onToggleOpen={() => toggleOpen(b.id)}
                          onChange={(nb) => updateBlock(nb)}
                          onDuplicate={() => {
                            const i = design.blocks.findIndex((x) => x.id === b.id);
                            const copy = { ...structuredClone(b), id: blockId() } as Block;
                            const blocks = [...design.blocks];
                            blocks.splice(i + 1, 0, copy);
                            set({ ...design, blocks });
                            setOpenId(copy.id);
                          }}
                          onRemove={() => set({ ...design, blocks: design.blocks.filter((x) => x.id !== b.id) })}
                        >
                          <BlockEditor block={b} onChange={updateBlock} data={previewData} allCollections={colsQ.data?.collections ?? []} />
                        </BlockRow>
                      ))}
                    </ul>
                  </SortableContext>
                </DndContext>
                <Button className="mt-3 w-full" variant="soft" icon={<Plus className="h-4 w-4" />} onClick={() => setAddOpen(true)}>
                  Add block{openId ? ' below selected' : ''}
                </Button>
                <p className="mt-3 text-center text-[11px] text-stone-400">Tip: click anything in the preview to edit it. Ctrl+Z to undo.</p>
              </>
            )}
            {tab === 'theme' && <ThemePanel design={design} onChange={set} />}
            {tab === 'settings' && (
              <div className="space-y-4">
                <Field label="Browser tab title"><Input value={design.seo.title} onChange={(e) => set({ ...design, seo: { ...design.seo, title: e.target.value } }, 'seo.title')} /></Field>
                <Field label="Short description (search engines & link previews)"><Textarea rows={3} value={design.seo.description} onChange={(e) => set({ ...design, seo: { ...design.seo, description: e.target.value } }, 'seo.desc')} /></Field>
                <Field label="Default language for students" hint="Students can still switch with the language button.">
                  <Select value={design.language} onChange={(e) => { set({ ...design, language: e.target.value as Lang }); setPreviewLang(e.target.value as Lang); }}>
                    <option value="bn">বাংলা</option>
                    <option value="en">English</option>
                  </Select>
                </Field>
                <div className="rounded-lg border border-stone-200 bg-white p-3 text-sm">
                  <div className="font-medium">Home page address</div>
                  <div className="mt-1 break-all text-indigo-700">{window.location.origin}/</div>
                  <Link to="/admin/system/settings" className="mt-1 inline-block text-xs text-stone-500 underline">Change the brand and site name in Site settings</Link>
                </div>
                <Button
                  variant="ghost"
                  className="text-red-600"
                  onClick={async () => {
                    if (await confirm({ title: 'Start over?', message: 'Replaces your draft with the default layout. You can undo this.', confirmLabel: 'Reset', danger: true })) set(defaultDesign(me.user.name));
                  }}
                >
                  Reset to default layout
                </Button>
              </div>
            )}
          </div>
        </aside>

        {/* Preview */}
        <div className="flex min-h-0 flex-1 justify-center overflow-hidden p-3 lg:p-5">
          <FramePreview width={deviceWidth} onDoc={(d) => (frameDoc.current = d)}>
            <PreviewInner design={design} data={previewData} lang={previewLang} setLang={setPreviewLang} selectedId={openId} onSelect={selectBlock} />
          </FramePreview>
        </div>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add a block" wide>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(BLOCK_LABELS) as BlockType[]).map((type) => (
            <button key={type} onClick={() => addBlock(type)} className="rounded-xl border border-stone-200 p-3 text-left transition hover:border-indigo-400 hover:bg-indigo-50/40">
              <div className="text-sm font-semibold">{BLOCK_LABELS[type].label}</div>
              <div className="text-xs text-stone-500">{BLOCK_LABELS[type].description}</div>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}

function PreviewInner(props: { design: PageDesign; data: PublicPageData; lang: Lang; setLang: (l: Lang) => void; selectedId: string | null; onSelect: (id: string) => void }) {
  return <PageView {...props} preview />;
}
