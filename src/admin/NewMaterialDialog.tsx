import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileUp, FolderUp, Link as LinkIcon, StickyNote, Trash2, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '../lib/api';
import { itemsFromFolder, itemsFromZip, uploadToMaterial, type UploadItem } from '../lib/upload';
import { formatBytes } from '../lib/format';
import { kindFromFileName, KIND_LABELS } from '../../shared/design';
import { toEmbedUrl } from '../lib/embed';
import { renderMarkdown } from '../lib/markdown';
import type { Material, Status } from '../../shared/types';
import { Button, Field, Input, Modal, Progress, Select, Tabs, Textarea, Toggle, cx } from '../components/ui';
import { KindIcon } from '../components/KindIcon';
import { useMyMaterials } from '../components/MaterialPicker';
import { useMe } from './AdminApp';
import TeacherSelect from './TeacherSelect';

type Mode = 'files' | 'folder' | 'embed' | 'note';

interface FileJob {
  file: File;
  title: string;
  state: 'pending' | 'uploading' | 'done' | 'error';
  progress: number;
  error?: string;
}

const stripExt = (n: string) => n.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();

export function MetaFields({
  subject,
  setSubject,
  classLevel,
  setClassLevel,
  tags,
  setTags,
}: {
  subject: string;
  setSubject: (v: string) => void;
  classLevel: string;
  setClassLevel: (v: string) => void;
  tags: string;
  setTags: (v: string) => void;
}) {
  const { data } = useMyMaterials();
  const subjects = useMemo(() => [...new Set((data?.materials ?? []).map((m) => m.subject).filter(Boolean))], [data]);
  const classes = useMemo(() => [...new Set((data?.materials ?? []).map((m) => m.class_level).filter(Boolean))], [data]);
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Subject">
        <Input list="subjects-list" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. বাংলা" />
        <datalist id="subjects-list">{subjects.map((s) => <option key={s} value={s} />)}</datalist>
      </Field>
      <Field label="Class / level">
        <Input list="classes-list" value={classLevel} onChange={(e) => setClassLevel(e.target.value)} placeholder="e.g. Class 5" />
        <datalist id="classes-list">{classes.map((s) => <option key={s} value={s} />)}</datalist>
      </Field>
      <Field label="Tags" hint="Comma separated">
        <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="chapter 1, poem" />
      </Field>
    </div>
  );
}

export const parseTags = (s: string) => s.split(',').map((t) => t.trim()).filter(Boolean);

export default function NewMaterialDialog({ open, onClose, initialFiles }: { open: boolean; onClose: () => void; initialFiles?: File[] }) {
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('files');
  const [jobs, setJobs] = useState<FileJob[]>([]);
  const [busy, setBusy] = useState(false);

  const [subject, setSubject] = useState('');
  const [classLevel, setClassLevel] = useState('');
  const [tags, setTags] = useState('');
  const [status, setStatus] = useState<Status>('published');
  const [allowDownload, setAllowDownload] = useState(true);
  const [ownerId, setOwnerId] = useState(me.user.id);

  const [folderItems, setFolderItems] = useState<UploadItem[]>([]);
  const [folderTitle, setFolderTitle] = useState('');
  const [entry, setEntry] = useState('');
  const [folderProgress, setFolderProgress] = useState<{ pct: number; text: string } | null>(null);

  const [embedUrl, setEmbedUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [body, setBody] = useState('');
  const [notePreview, setNotePreview] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && initialFiles?.length) {
      setMode('files');
      addFiles(initialFiles);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFiles]);

  const reset = () => {
    setJobs([]);
    setFolderItems([]);
    setFolderTitle('');
    setEntry('');
    setFolderProgress(null);
    setEmbedUrl('');
    setTitle('');
    setDescription('');
    setBody('');
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const addFiles = (files: File[]) => {
    const maxBytes = me.settings.maxFileMb > 0 ? me.settings.maxFileMb * 1048576 : Infinity;
    const proxyMax = me.capabilities.presign ? Infinity : me.capabilities.maxProxyUploadBytes;
    setJobs((j) => [
      ...j,
      ...files.map((file) => {
        const tooBig = file.size > maxBytes || file.size > proxyMax;
        return {
          file,
          title: stripExt(file.name),
          state: tooBig ? ('error' as const) : ('pending' as const),
          progress: 0,
          error: tooBig ? `Too large (limit ${formatBytes(Math.min(maxBytes, proxyMax))})` : undefined,
        };
      }),
    ]);
  };

  const meta = () => ({ subject, class_level: classLevel, tags: parseTags(tags), status, allow_download: allowDownload, owner_id: ownerId || undefined });

  const after = async (created: Material[]) => {
    await Promise.all([qc.invalidateQueries({ queryKey: ['materials'] }), qc.invalidateQueries({ queryKey: ['me'] }), qc.invalidateQueries({ queryKey: ['dashboard'] })]);
    if (created.length === 1) navigate(`/admin/materials/${created[0].id}`);
    reset();
    onClose();
  };

  const uploadFiles = async () => {
    setBusy(true);
    const created: Material[] = [];
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      if (job.state !== 'pending') continue;
      const update = (p: Partial<FileJob>) => setJobs((all) => all.map((x, k) => (k === i ? { ...x, ...p } : x)));
      update({ state: 'uploading', progress: 0 });
      try {
        const kind = kindFromFileName(job.file.name);
        const { material } = await adminApi<{ material: Material }>('/materials', {
          method: 'POST',
          body: { ...meta(), title: job.title || job.file.name, kind: kind === 'html' ? 'file' : kind },
        });
        const done = await uploadToMaterial(material.id, [{ path: job.file.name, file: job.file, type: job.file.type }], (p) => update({ progress: p.total ? (p.loaded / p.total) * 100 : 0 }));
        created.push(done);
        update({ state: 'done', progress: 100 });
      } catch (e: any) {
        update({ state: 'error', error: e.message });
      }
    }
    setBusy(false);
    if (created.length) {
      toast.success(`Uploaded ${created.length} material${created.length > 1 ? 's' : ''}`);
      if (created.length === jobs.filter((j) => j.state !== 'error').length || created.length === jobs.length) await after(created);
      else qc.invalidateQueries({ queryKey: ['materials'] });
    }
  };

  const onFolderFiles = async (files: File[], zip?: File) => {
    try {
      const items = zip ? await itemsFromZip(zip) : itemsFromFolder(files);
      if (!items.length) return toast.error('No files found');
      setFolderItems(items);
      const htmls = items.filter((i) => /\.html?$/i.test(i.path)).sort((a, b) => a.path.split('/').length - b.path.split('/').length);
      setEntry(htmls.find((h) => /(^|\/)index\.html?$/i.test(h.path))?.path ?? htmls[0]?.path ?? '');
      if (!folderTitle) setFolderTitle(stripExt(zip?.name ?? (files[0] as any)?.webkitRelativePath?.split('/')[0] ?? 'Interactive lesson'));
    } catch (e: any) {
      toast.error(`Could not read files: ${e.message}`);
    }
  };

  const uploadFolder = async () => {
    if (!entry) return toast.error('The folder needs an .html file to open');
    setBusy(true);
    try {
      const { material } = await adminApi<{ material: Material }>('/materials', { method: 'POST', body: { ...meta(), title: folderTitle || 'Interactive lesson', description, kind: 'html' } });
      const done = await uploadToMaterial(
        material.id,
        folderItems,
        (p) => setFolderProgress({ pct: p.total ? (p.loaded / p.total) * 100 : 0, text: `${p.done}/${p.count} files · ${formatBytes(p.loaded)} of ${formatBytes(p.total)}` }),
        { entryPath: entry, kind: 'html' },
      );
      toast.success('Interactive lesson uploaded');
      await after([done]);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const createSimple = async (kind: 'embed' | 'note') => {
    if (!title.trim()) return toast.error('Add a title');
    if (kind === 'embed' && !toEmbedUrl(embedUrl)) return toast.error('Paste a valid https link');
    setBusy(true);
    try {
      const { material } = await adminApi<{ material: Material }>('/materials', {
        method: 'POST',
        body: { ...meta(), title, description, kind, embed_url: kind === 'embed' ? embedUrl : undefined, body_md: kind === 'note' ? body : undefined },
      });
      toast.success('Material created');
      await after([material]);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const pending = jobs.filter((j) => j.state === 'pending').length;
  const totalSize = folderItems.reduce((s, i) => s + i.file.size, 0);
  const embedPreview = toEmbedUrl(embedUrl);

  const footer =
    mode === 'files' ? (
      <Button variant="primary" disabled={!pending} loading={busy} onClick={uploadFiles}>
        Upload {pending || ''} file{pending === 1 ? '' : 's'}
      </Button>
    ) : mode === 'folder' ? (
      <Button variant="primary" disabled={!folderItems.length} loading={busy} onClick={uploadFolder}>
        Upload {folderItems.length} files
      </Button>
    ) : (
      <Button variant="primary" loading={busy} onClick={() => createSimple(mode)}>
        Create
      </Button>
    );

  return (
    <Modal open={open} onClose={close} title="Add material" wide footer={<><Button onClick={close} disabled={busy}>Cancel</Button>{footer}</>}>
      <input ref={fileInput} type="file" multiple hidden onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
      <input ref={folderInput} type="file" hidden multiple {...({ webkitdirectory: '', directory: '' } as any)} onChange={(e) => { onFolderFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
      <input ref={zipInput} type="file" accept=".zip" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFolderFiles([], f); e.target.value = ''; }} />

      <Tabs
        className="mb-5"
        value={mode}
        onChange={setMode}
        tabs={[
          { id: 'files', label: <span className="flex items-center justify-center gap-1.5"><FileUp className="h-4 w-4" /> Files</span> },
          { id: 'folder', label: <span className="flex items-center justify-center gap-1.5"><FolderUp className="h-4 w-4" /> Folder / HTML</span> },
          { id: 'embed', label: <span className="flex items-center justify-center gap-1.5"><LinkIcon className="h-4 w-4" /> Video link</span> },
          { id: 'note', label: <span className="flex items-center justify-center gap-1.5"><StickyNote className="h-4 w-4" /> Note</span> },
        ]}
      />

      {mode === 'files' && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); addFiles(Array.from(e.dataTransfer.files)); }}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 px-6 py-8 text-center hover:border-indigo-400 hover:bg-indigo-50/40"
          >
            <FileUp className="h-8 w-8 text-indigo-500" />
            <span className="font-medium">Drop files here or click to choose</span>
            <span className="text-xs text-stone-500">PDF, Word, PowerPoint, Excel, audio, video, images… each file becomes its own material.</span>
          </button>
          {jobs.length > 0 && (
            <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
              {jobs.map((j, i) => (
                <li key={i} className="flex items-center gap-3 px-3 py-2.5">
                  <KindIcon kind={kindFromFileName(j.file.name)} colored className="h-5 w-5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <input
                      value={j.title}
                      disabled={j.state !== 'pending'}
                      onChange={(e) => setJobs((all) => all.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))}
                      className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium hover:border-stone-200 focus:border-indigo-400 focus:outline-none"
                    />
                    <div className="px-1 text-xs text-stone-500">
                      {KIND_LABELS[kindFromFileName(j.file.name)].en} · {formatBytes(j.file.size)}
                      {j.error && <span className="ml-2 text-red-600">{j.error}</span>}
                    </div>
                    {j.state === 'uploading' && <Progress value={j.progress} className="mt-1 h-1.5" />}
                  </div>
                  {j.state === 'done' ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  ) : j.state === 'error' ? (
                    <AlertCircle className="h-5 w-5 text-red-500" />
                  ) : j.state === 'uploading' ? (
                    <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
                  ) : (
                    <button onClick={() => setJobs((all) => all.filter((_, k) => k !== i))} className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-red-600" aria-label="Remove">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {jobs.some((j) => kindFromFileName(j.file.name) === 'video' && j.file.size > 200 * 1048576) && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Large videos use a lot of the free 10 GB storage. Consider uploading them to YouTube as unlisted and adding a video link instead.</p>
          )}
        </div>
      )}

      {mode === 'folder' && (
        <div className="space-y-4">
          <p className="text-sm text-stone-600">Upload a complete mini-website (HTML, CSS, JS, images, audio). Students open it like an interactive lesson.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => folderInput.current?.click()} className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 p-6 hover:border-indigo-400">
              <FolderUp className="h-7 w-7 text-indigo-500" />
              <span className="text-sm font-medium">Choose a folder</span>
            </button>
            <button type="button" onClick={() => zipInput.current?.click()} className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 p-6 hover:border-indigo-400">
              <FileUp className="h-7 w-7 text-indigo-500" />
              <span className="text-sm font-medium">Choose a .zip file</span>
            </button>
          </div>
          {folderItems.length > 0 && (
            <>
              <div className="rounded-lg bg-stone-50 px-3 py-2 text-sm">
                <b>{folderItems.length}</b> files · {formatBytes(totalSize)}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Title">
                  <Input value={folderTitle} onChange={(e) => setFolderTitle(e.target.value)} />
                </Field>
                <Field label="Start page" hint="The page students see first">
                  <Select value={entry} onChange={(e) => setEntry(e.target.value)}>
                    {folderItems.filter((i) => /\.html?$/i.test(i.path)).map((i) => (
                      <option key={i.path} value={i.path}>{i.path}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="Description">
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
              </Field>
              {folderProgress && (
                <div>
                  <Progress value={folderProgress.pct} />
                  <div className="mt-1 text-xs text-stone-500">{folderProgress.text}</div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {mode === 'embed' && (
        <div className="space-y-3">
          <Field label="Video or page link" hint="YouTube, Vimeo, Facebook video, Google Drive file or any https page that allows embedding">
            <Input value={embedUrl} onChange={(e) => setEmbedUrl(e.target.value)} placeholder="https://youtu.be/…" autoFocus />
          </Field>
          {embedPreview && (
            <div className="aspect-video overflow-hidden rounded-lg bg-black">
              <iframe src={embedPreview} className="h-full w-full" title="Preview" allowFullScreen />
            </div>
          )}
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Description">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </Field>
        </div>
      )}

      {mode === 'note' && (
        <div className="space-y-3">
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </Field>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="label">Content (Markdown)</span>
              <Toggle checked={notePreview} onChange={setNotePreview} label={<span className="text-xs">Preview</span>} />
            </div>
            {notePreview ? (
              <div className="tp-prose min-h-[220px] rounded-lg border border-stone-200 p-3 text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }} />
            ) : (
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} placeholder={'# Heading\n\nWrite your lesson notes, homework, or reading here.\n\n- Lists\n- **Bold**, *italic*, [links](https://…)'} className="font-mono text-[13px]" />
            )}
          </div>
        </div>
      )}

      <div className={cx('mt-6 space-y-3 border-t border-stone-100 pt-4')}>
        <MetaFields subject={subject} setSubject={setSubject} classLevel={classLevel} setClassLevel={setClassLevel} tags={tags} setTags={setTags} />
        <div className="flex flex-wrap items-center gap-4">
          <TeacherSelect value={ownerId} onChange={setOwnerId} className="w-72" />
          <Field label="Visibility" className="w-52">
            <Select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
              <option value="published">Published on my page</option>
              <option value="unlisted">Link only (hidden from page)</option>
              <option value="draft">Draft (only me)</option>
            </Select>
          </Field>
          <div className="pt-5">
            <Toggle checked={allowDownload} onChange={setAllowDownload} label="Students can download" />
          </div>
        </div>
      </div>
    </Modal>
  );
}
