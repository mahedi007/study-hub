import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, FileUp, FolderUp, Layers, Save, Share2, Trash2, Copy, RefreshCw, Headphones } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '../lib/api';
import type { Material, MaterialAccess, Status } from '../../shared/types';
import { ICON_CHOICES, KIND_ICONS, KIND_LABELS, presetTheme } from '../../shared/design';
import { Button, Card, Field, Input, PageLoader, Progress, Select, StatusBadge, Textarea, Toggle, useConfirm } from '../components/ui';
import { ImagePicker } from '../components/ImagePicker';
import { KindIcon } from '../components/KindIcon';
import { copyText, formatBytes, formatDate } from '../lib/format';
import { itemsFromFolder, itemsFromZip, uploadToMaterial, type UploadItem } from '../lib/upload';
import { renderMarkdown } from '../lib/markdown';
import { themeStyle } from '../lib/theme';
import { Viewer } from '../public/viewers/Viewer';
import AudioPlayer from '../public/viewers/AudioPlayer';
import { MetaFields, parseTags } from './NewMaterialDialog';
import ShareDialog from './ShareDialog';
import { useMe } from './AdminApp';

type Detail = {
  material: Material;
  collections: { id: string; title: string }[];
  link_count: number;
  files: { path: string; size: number }[];
  access: MaterialAccess;
};

const previewTheme = presetTheme('munjiba');

export default function MaterialEdit() {
  const { id = '' } = useParams();
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['material', id], queryFn: () => adminApi<Detail>(`/materials/${id}`) });

  const [form, setForm] = useState({ title: '', description: '', subject: '', class_level: '', tags: '', status: 'draft' as Status, allow_download: true, cover_asset: null as string | null, embed_url: '', body_md: '', entry_path: '', icon: '', slug: '' });
  const audioInput = useRef<HTMLInputElement>(null);
  const [audioUp, setAudioUp] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [share, setShare] = useState(false);
  const [upload, setUpload] = useState<{ pct: number; text: string } | null>(null);
  const [notePreview, setNotePreview] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);

  const fromMaterial = (m: Material) => ({
    title: m.title,
    description: m.description,
    subject: m.subject,
    class_level: m.class_level,
    tags: m.tags.join(', '),
    status: m.status,
    allow_download: m.allow_download,
    cover_asset: m.cover_asset,
    embed_url: m.embed_url ?? '',
    body_md: m.body_md ?? '',
    entry_path: m.entry_path ?? '',
    icon: m.icon ?? '',
    slug: m.slug ?? '',
  });

  useEffect(() => {
    if (data) setForm(fromMaterial(data.material));
  }, [data]);

  const dirty = useMemo(() => data && JSON.stringify(fromMaterial(data.material)) !== JSON.stringify(form), [data, form]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (dirty) save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (isLoading) return <PageLoader />;
  if (error || !data) return <p className="text-red-600">{(error as Error)?.message}</p>;
  const m = data.material;
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const refreshAll = async () => {
    await Promise.all([refetch(), qc.invalidateQueries({ queryKey: ['materials'] }), qc.invalidateQueries({ queryKey: ['me'] })]);
  };

  async function save() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        title: form.title,
        description: form.description,
        subject: form.subject,
        class_level: form.class_level,
        tags: parseTags(form.tags),
        status: form.status,
        allow_download: form.allow_download,
        cover_asset: form.cover_asset,
        icon: form.icon,
        slug: form.slug.trim().toLowerCase(),
      };
      if (m.kind === 'embed') body.embed_url = form.embed_url;
      if (m.kind === 'note') body.body_md = form.body_md;
      if (m.kind === 'html' && form.entry_path) body.entry_path = form.entry_path;
      await adminApi(`/materials/${m.id}`, { method: 'PATCH', body });
      toast.success('Saved');
      await refreshAll();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  const replace = async (items: UploadItem[], kind?: 'html') => {
    if (!items.length) return;
    try {
      setUpload({ pct: 0, text: 'Removing old files…' });
      await adminApi(`/materials/${m.id}/reset-files`, { method: 'POST' });
      const entry = kind === 'html' ? items.map((i) => i.path).filter((p) => /\.html?$/i.test(p)).sort((a, b) => a.split('/').length - b.split('/').length).find((p) => /index\.html?$/i.test(p)) : undefined;
      await uploadToMaterial(m.id, items, (p) => setUpload({ pct: p.total ? (p.loaded / p.total) * 100 : 0, text: `${p.done}/${p.count} files · ${formatBytes(p.loaded)} / ${formatBytes(p.total)}` }), { kind, entryPath: entry });
      toast.success('Files replaced');
      await refreshAll();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUpload(null);
    }
  };

  const uploadAudio = async (f: File) => {
    try {
      setAudioUp(0);
      const path = `_audio/${f.name.replace(/[\\/]/g, '_')}`;
      const { targets } = await adminApi<{ targets: { url: string; headers: Record<string, string> }[] }>(`/materials/${m.id}/upload-targets`, {
        method: 'POST',
        body: { files: [{ path, size: f.size, type: f.type || 'audio/mpeg' }] },
      });
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', targets[0].url);
        for (const [k, v] of Object.entries(targets[0].headers)) xhr.setRequestHeader(k, v);
        xhr.upload.onprogress = (e) => setAudioUp(e.total ? (e.loaded / e.total) * 100 : 0);
        xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send(f);
      });
      await adminApi(`/materials/${m.id}/audio`, { method: 'POST', body: { path } });
      toast.success('Lecture audio added');
      await refreshAll();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAudioUp(null);
    }
  };

  const removeAudio = async () => {
    if (!(await confirm({ title: 'Remove the lecture audio?', danger: true, confirmLabel: 'Remove' }))) return;
    await adminApi(`/materials/${m.id}/reset-files?scope=audio`, { method: 'POST' });
    await refreshAll();
  };

  const remove = async () => {
    if (!(await confirm({ title: `Delete “${m.title}”?`, message: 'Files are removed and share links stop working.', danger: true, confirmLabel: 'Delete' }))) return;
    await adminApi(`/materials/${m.id}`, { method: 'DELETE' });
    qc.invalidateQueries({ queryKey: ['materials'] });
    navigate('/admin/materials');
  };

  const duplicate = async () => {
    const { material } = await adminApi<{ material: Material }>(`/materials/${m.id}/duplicate`, { method: 'POST' });
    qc.invalidateQueries({ queryKey: ['materials'] });
    navigate(`/admin/materials/${material.id}`);
  };

  const publicUrl = `${window.location.origin}/topic/${m.slug}`;
  const isFileKind = !['embed', 'note'].includes(m.kind) || !!m.file_name;
  const htmlEntries = data.files.filter((f) => /\.html?$/i.test(f.path));

  return (
    <div>
      <input ref={audioInput} type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAudio(f); e.target.value = ''; }} />
      <input ref={fileInput} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) replace([{ path: f.name, file: f, type: f.type }]); e.target.value = ''; }} />
      <input ref={folderInput} type="file" hidden multiple {...({ webkitdirectory: '', directory: '' } as any)} onChange={(e) => { replace(itemsFromFolder(Array.from(e.target.files ?? [])), 'html'); e.target.value = ''; }} />
      <input ref={zipInput} type="file" accept=".zip" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) replace(await itemsFromZip(f), 'html'); e.target.value = ''; }} />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link to="/admin/materials" className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100" aria-label="Back"><ArrowLeft className="h-5 w-5" /></Link>
        <KindIcon kind={m.kind} colored className="h-6 w-6" />
        <h1 className="min-w-0 flex-1 truncate text-xl font-semibold">{m.title}</h1>
        <StatusBadge status={m.status} />
        <div className="flex flex-wrap gap-2">
          <Button icon={<Share2 className="h-4 w-4" />} onClick={() => setShare(true)}>Share{data.link_count ? ` (${data.link_count})` : ''}</Button>
          <Button variant="primary" icon={<Save className="h-4 w-4" />} loading={saving} disabled={!dirty} onClick={save}>Save</Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="space-y-5">
          <Card className="space-y-4 p-5">
            <Field label="Title"><Input value={form.title} onChange={(e) => set('title', e.target.value)} /></Field>
            <Field label="Page link" hint="Lowercase English letters, numbers and dashes — e.g. bagdhara-exercise">
              <div className="flex items-center overflow-hidden rounded-xl border-[1.5px] border-stone-300 bg-white focus-within:border-indigo-600">
                <span className="whitespace-nowrap border-r border-stone-200 bg-stone-50 px-2.5 py-2 text-xs text-stone-500">{window.location.host}/topic/</span>
                <input
                  value={form.slug}
                  onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-{2,}/g, '-'))}
                  className="min-w-0 flex-1 bg-transparent px-2.5 py-2 text-[15px] outline-none"
                />
              </div>
            </Field>
            <Field label="Description"><Textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} placeholder="What students should do with this material" /></Field>
            <MetaFields subject={form.subject} setSubject={(v) => set('subject', v)} classLevel={form.class_level} setClassLevel={(v) => set('class_level', v)} tags={form.tags} setTags={(v) => set('tags', v)} />
            {m.kind === 'embed' && <Field label="Embed link"><Input value={form.embed_url} onChange={(e) => set('embed_url', e.target.value)} /></Field>}
            {m.kind === 'note' && (
              <div>
                <div className="mb-1 flex items-center justify-between"><span className="label">Content (Markdown)</span><Toggle checked={notePreview} onChange={setNotePreview} label={<span className="text-xs">Preview</span>} /></div>
                {notePreview ? <div className="tp-prose min-h-[240px] rounded-lg border border-stone-200 p-3 text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(form.body_md) }} /> : <Textarea value={form.body_md} onChange={(e) => set('body_md', e.target.value)} rows={14} className="font-mono text-[13px]" />}
              </div>
            )}
          </Card>

          <Card className="space-y-3 p-5">
            <h2 className="serif text-lg font-bold text-indigo-600">Card icon</h2>
            <p className="text-xs text-stone-500">Shown on the dark card cover when there is no cover image.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => set('icon', '')} className={`flex h-11 items-center rounded-xl border-[1.5px] px-3 text-xs font-semibold ${!form.icon ? 'border-stone-900 bg-gold-soft' : 'border-stone-300 bg-white'}`}>
                Auto {KIND_ICONS[m.kind]}
              </button>
              {ICON_CHOICES.map((ic) => (
                <button key={ic} type="button" onClick={() => set('icon', ic)} className={`h-11 w-11 rounded-xl border-[1.5px] text-[22px] ${form.icon === ic ? 'border-stone-900 bg-gold-soft' : 'border-stone-300 bg-white hover:border-stone-500'}`}>
                  {ic}
                </button>
              ))}
            </div>
          </Card>

          {m.kind !== 'html' && <Card className="space-y-3 p-5">
            <h2 className="serif flex items-center gap-2 text-lg font-bold text-indigo-600"><Headphones className="h-5 w-5" /> Lecture audio</h2>
            <p className="text-xs text-stone-500">Add a recorded explanation. Students see a player above the material (great for worksheets and practice pages).</p>
            {audioUp !== null ? (
              <Progress value={audioUp} />
            ) : m.audio_file ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border-[1.5px] border-stone-300 bg-stone-50 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">🎧 {m.audio_file.replace('_audio/', '')}</span>
                <Button size="sm" onClick={() => audioInput.current?.click()}>Replace</Button>
                <Button size="sm" variant="danger" onClick={removeAudio}>Remove</Button>
              </div>
            ) : (
              <Button size="sm" variant="soft" icon={<Headphones className="h-3.5 w-3.5" />} onClick={() => audioInput.current?.click()}>Add lecture audio</Button>
            )}
          </Card>}

          <Card className="space-y-4 p-5">
            <h2 className="serif text-lg font-bold text-indigo-600">Visibility</h2>
            <Field label="Who can see it">
              <Select value={form.status} onChange={(e) => set('status', e.target.value as Status)}>
                <option value="published">Published — listed on my page</option>
                <option value="unlisted">Link only — hidden from my page, open via share links / collections</option>
                <option value="draft">Draft — only me</option>
              </Select>
            </Field>
            <Toggle checked={form.allow_download} onChange={(v) => set('allow_download', v)} label="Show a download button to students" />
            <p className="text-xs text-stone-500">Turning downloads off hides the button; determined students can still save what their browser displays.</p>
            <ImagePicker label="Cover image (optional)" value={form.cover_asset} onChange={(v) => set('cover_asset', v)} />
          </Card>

          {isFileKind && (
            <Card className="space-y-3 p-5">
              <h2 className="serif text-lg font-bold text-indigo-600">Files</h2>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-stone-500">Type</dt><dd>{KIND_LABELS[m.kind].en}</dd>
                <dt className="text-stone-500">{m.kind === 'html' ? 'Start page' : 'File'}</dt><dd className="truncate">{m.file_name ?? '—'}</dd>
                <dt className="text-stone-500">Size</dt><dd>{formatBytes(m.size_bytes)}{m.file_count > 1 ? ` · ${m.file_count} files` : ''}</dd>
                <dt className="text-stone-500">Created</dt><dd>{formatDate(m.created_at)}</dd>
              </dl>
              {m.kind === 'html' && htmlEntries.length > 1 && (
                <Field label="Start page">
                  <Select value={form.entry_path} onChange={(e) => set('entry_path', e.target.value)}>
                    {htmlEntries.map((f) => <option key={f.path}>{f.path}</option>)}
                  </Select>
                </Field>
              )}
              {upload ? (
                <div><Progress value={upload.pct} /><div className="mt-1 text-xs text-stone-500">{upload.text}</div></div>
              ) : m.kind === 'html' ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" icon={<FolderUp className="h-3.5 w-3.5" />} onClick={() => folderInput.current?.click()}>Replace with folder</Button>
                  <Button size="sm" icon={<FileUp className="h-3.5 w-3.5" />} onClick={() => zipInput.current?.click()}>Replace with .zip</Button>
                </div>
              ) : (
                <Button size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => fileInput.current?.click()}>{m.ready ? 'Replace file' : 'Upload file'}</Button>
              )}
              {m.kind === 'html' && data.files.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-stone-500">Show {data.files.length} files</summary>
                  <ul className="mt-2 max-h-48 overflow-y-auto rounded bg-stone-50 p-2 font-mono">
                    {data.files.map((f) => <li key={f.path} className="flex justify-between gap-2"><span className="truncate">{f.path}</span><span className="text-stone-400">{formatBytes(f.size)}</span></li>)}
                  </ul>
                </details>
              )}
            </Card>
          )}

          <Card className="space-y-2 p-5">
            {data.collections.length > 0 && (
              <div className="text-sm">
                <span className="text-stone-500">In collections: </span>
                {data.collections.map((c, i) => (
                  <span key={c.id}>{i > 0 && ', '}<Link to={`/admin/collections/${c.id}`} className="text-indigo-600 hover:underline"><Layers className="mr-0.5 inline h-3.5 w-3.5" />{c.title}</Link></span>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              {m.status !== 'draft' && (
                <>
                  <a href={publicUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-50"><ExternalLink className="h-3.5 w-3.5" /> Open public page</a>
                  <Button size="sm" icon={<Copy className="h-3.5 w-3.5" />} onClick={async () => { await copyText(publicUrl); toast.success('Copied'); }}>Copy public link</Button>
                </>
              )}
              {['embed', 'note'].includes(m.kind) && <Button size="sm" onClick={duplicate}>Duplicate</Button>}
              <Button size="sm" variant="ghost" className="ml-auto text-red-600" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={remove}>Delete</Button>
            </div>
          </Card>
        </div>

        <div>
          <div className="sticky top-4">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">Student preview</div>
            <div className="tp-scope max-h-[85vh] space-y-5 overflow-y-auto rounded-2xl border-[1.5px] border-stone-900 p-5" style={themeStyle(previewTheme)} data-card={previewTheme.cardStyle} data-btn={previewTheme.buttonStyle}>
              {data.access.audioUrl && <AudioPlayer url={data.access.audioUrl} id={`${m.id}-admin`} title="লেকচার অডিও" lang="bn" sticky={false} />}
              {m.kind === 'html' ? (
                <div className="tp-card space-y-3 p-6 text-center">
                  <div className="text-5xl">{form.icon || KIND_ICONS.html}</div>
                  <p className="text-[15px]">HTML lessons open as their own standalone page, exactly as uploaded{m.status === 'draft' ? ' (publish it or set it to “link only” to give it a public link)' : ''}.</p>
                  {data.access.bundleUrl && (
                    <a href={data.access.bundleUrl} target="_blank" rel="noreferrer" className="tp-btn">Open the page ↗</a>
                  )}
                </div>
              ) : m.kind === 'note' ? (
                <div className="tp-card tp-prose p-5" dangerouslySetInnerHTML={{ __html: renderMarkdown(form.body_md) }} />
              ) : (
                <Viewer key={m.updated_at} material={m} access={data.access} lang="bn" />
              )}
            </div>
          </div>
        </div>
      </div>

      {share && <ShareDialog open onClose={() => { setShare(false); refetch(); }} targetType="material" targetId={m.id} title={m.title} />}
    </div>
  );
}
