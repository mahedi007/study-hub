import { unzipSync } from 'fflate';
import { adminApi } from './api';
import { mimeFor } from '../../shared/design';
import type { Material, MaterialKind } from '../../shared/types';

export interface UploadItem {
  path: string;
  file: Blob;
  type: string;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  done: number;
  count: number;
  current?: string;
}

/** Turn a FileList from <input webkitdirectory> into relative paths, dropping the common top folder. */
export function itemsFromFolder(files: File[]): UploadItem[] {
  const rels = files.map((f) => (f as any).webkitRelativePath || f.name);
  const firstSegs = new Set(rels.map((r: string) => r.split('/')[0]));
  const strip = firstSegs.size === 1 && rels.every((r: string) => r.includes('/'));
  return files
    .map((f, i) => ({
      path: strip ? rels[i].split('/').slice(1).join('/') : rels[i],
      file: f as Blob,
      type: f.type || mimeFor(rels[i]),
    }))
    .filter((it) => it.path && !/(^|\/)(\.DS_Store|Thumbs\.db|__MACOSX)/.test(it.path));
}

/** Unzip a .zip in the browser (no server CPU) and return its files. */
export async function itemsFromZip(zip: File): Promise<UploadItem[]> {
  const buf = new Uint8Array(await zip.arrayBuffer());
  const entries = unzipSync(buf);
  let items = Object.entries(entries)
    .filter(([path, data]) => !path.endsWith('/') && data.length >= 0 && !/(^|\/)(__MACOSX|\.DS_Store)/.test(path))
    .map(([path, data]) => ({ path, file: new Blob([data as BlobPart]), type: mimeFor(path) }));
  const tops = new Set(items.map((i) => i.path.split('/')[0]));
  if (tops.size === 1 && items.every((i) => i.path.includes('/'))) {
    items = items.map((i) => ({ ...i, path: i.path.split('/').slice(1).join('/') }));
  }
  return items;
}

function putWithProgress(url: string, item: UploadItem, headers: Record<string, string>, onProgress: (loaded: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed for ${item.path} (${xhr.status}) ${xhr.responseText.slice(0, 200)}`)));
    xhr.onerror = () => reject(new Error(`Network error while uploading ${item.path}. If you use direct R2 uploads, check the bucket CORS rules.`));
    xhr.send(item.file);
  });
}

export async function uploadToMaterial(
  materialId: string,
  items: UploadItem[],
  onProgress: (p: UploadProgress) => void,
  opts: { entryPath?: string; kind?: MaterialKind } = {},
): Promise<Material> {
  const total = items.reduce((s, i) => s + i.file.size, 0);
  const loadedByPath = new Map<string, number>();
  let done = 0;
  const report = (current?: string) =>
    onProgress({ loaded: [...loadedByPath.values()].reduce((a, b) => a + b, 0), total, done, count: items.length, current });

  for (let i = 0; i < items.length; i += 50) {
    const batch = items.slice(i, i + 50);
    const { targets } = await adminApi<{ targets: { path: string; url: string; headers: Record<string, string> }[] }>(
      `/materials/${materialId}/upload-targets`,
      { method: 'POST', body: { files: batch.map((b) => ({ path: b.path, size: b.file.size, type: b.type })) } },
    );
    const queue = batch.map((item, idx) => ({ item, target: targets[idx] }));
    const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (queue.length) {
        const job = queue.shift()!;
        report(job.item.path);
        await putWithProgress(job.target.url, job.item, job.target.headers, (loaded) => {
          loadedByPath.set(job.item.path, loaded);
          report(job.item.path);
        });
        loadedByPath.set(job.item.path, job.item.file.size);
        done++;
        report();
      }
    });
    await Promise.all(workers);
  }
  const { material } = await adminApi<{ material: Material }>(`/materials/${materialId}/finalize`, {
    method: 'POST',
    body: { entryPath: opts.entryPath, kind: opts.kind },
  });
  return material;
}
