import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Trash2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '../lib/api';
import { compressImage } from '../lib/image';
import type { Asset } from '../../shared/types';
import { Button, Modal, Spinner, cx } from './ui';

export const assetSrc = (id: string | null | undefined) => (id ? `/api/assets/${id}` : '');

export function useAssets(enabled = true) {
  return useQuery({ queryKey: ['assets'], queryFn: () => adminApi<{ assets: Asset[] }>('/assets'), enabled });
}

export async function uploadImage(file: File): Promise<Asset> {
  const blob = await compressImage(file);
  const type = blob.type || file.type;
  const { asset } = await adminApi<{ asset: Asset }>('/assets', {
    method: 'POST',
    raw: true,
    body: blob,
    headers: { 'Content-Type': type, 'X-File-Name': encodeURIComponent(file.name) },
  });
  return asset;
}

export function ImagePicker({
  value,
  onChange,
  label = 'Image',
  aspect = 'aspect-video',
  compact,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  label?: string;
  aspect?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <span className="label">{label}</span>
      <div className={cx('group relative overflow-hidden rounded-lg border border-dashed border-stone-300 bg-stone-50', compact ? 'h-20 w-20' : aspect)}>
        {value ? (
          <>
            <img src={assetSrc(value)} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 transition group-hover:opacity-100">
              <Button size="sm" onClick={() => setOpen(true)}>Change</Button>
              <Button size="sm" variant="danger" onClick={() => onChange(null)} icon={<X className="h-3.5 w-3.5" />} />
            </div>
          </>
        ) : (
          <button type="button" onClick={() => setOpen(true)} className="flex h-full w-full flex-col items-center justify-center gap-1 text-xs text-stone-500 hover:bg-stone-100">
            <ImagePlus className="h-5 w-5" />
            {!compact && 'Choose image'}
          </button>
        )}
      </div>
      <AssetLibrary open={open} onClose={() => setOpen(false)} onPick={(id) => { onChange(id); setOpen(false); }} />
    </div>
  );
}

export function AssetLibrary({ open, onClose, onPick, multiple, onPickMany }: { open: boolean; onClose: () => void; onPick?: (id: string) => void; multiple?: boolean; onPickMany?: (ids: string[]) => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useAssets(open);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const uploaded: Asset[] = [];
      for (const f of Array.from(files)) uploaded.push(await uploadImage(f));
      await qc.invalidateQueries({ queryKey: ['assets'] });
      if (!multiple && uploaded[0]) onPick?.(uploaded[0].id);
      else setSelected((s) => [...s, ...uploaded.map((u) => u.id)]);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    await adminApi(`/assets/${id}`, { method: 'DELETE' });
    qc.invalidateQueries({ queryKey: ['assets'] });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Image library"
      wide
      footer={
        multiple ? (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={!selected.length} onClick={() => { onPickMany?.(selected); setSelected([]); onClose(); }}>
              Add {selected.length || ''} image{selected.length === 1 ? '' : 's'}
            </Button>
          </>
        ) : undefined
      }
    >
      <input ref={input} type="file" accept="image/*" multiple={multiple} hidden onChange={(e) => onFiles(e.target.files)} />
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-stone-500">Images are resized in your browser before upload to save storage.</p>
        <Button variant="primary" icon={<Upload className="h-4 w-4" />} loading={busy} onClick={() => input.current?.click()}>
          Upload
        </Button>
      </div>
      {isLoading ? (
        <Spinner />
      ) : !data?.assets.length ? (
        <p className="py-10 text-center text-sm text-stone-500">No images yet. Upload one to get started.</p>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {data.assets.map((a) => {
            const isSel = selected.includes(a.id);
            return (
              <div key={a.id} className={cx('group relative aspect-square overflow-hidden rounded-lg border-2', isSel ? 'border-indigo-500' : 'border-transparent')}>
                <button
                  type="button"
                  className="h-full w-full"
                  onClick={() => (multiple ? setSelected((s) => (isSel ? s.filter((x) => x !== a.id) : [...s, a.id])) : onPick?.(a.id))}
                >
                  <img src={a.url} alt={a.name} loading="lazy" className="h-full w-full object-cover" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(a.id)}
                  className="absolute right-1 top-1 hidden rounded bg-white/90 p-1 text-red-600 shadow group-hover:block"
                  aria-label="Delete image"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
