import { AwsClient } from 'aws4fetch';
import type { Env } from './env';
import type { Material, MaterialAccess } from '../shared/types';
import { mimeFor } from '../shared/design';
import { materialPrefix, signToken } from './tokens';

const ACCESS_TTL = 6 * 60 * 60; // 6 hours

let aws: AwsClient | null = null;
function awsClient(env: Env): AwsClient | null {
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) return null;
  if (!aws) {
    aws = new AwsClient({
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      service: 's3',
      region: 'auto',
    });
  }
  return aws;
}

export const canPresign = (env: Env) => !!awsClient(env);

export function encodePath(p: string): string {
  return p.split('/').map(encodeURIComponent).join('/');
}

export async function presign(
  env: Env,
  key: string,
  method: 'GET' | 'PUT',
  ttl: number,
  extra: Record<string, string> = {},
): Promise<string> {
  const client = awsClient(env);
  if (!client) throw new Error('Presigning not configured');
  const bucket = env.R2_BUCKET_NAME || 'study-hub-files';
  const url = new URL(`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${bucket}/${encodePath(key)}`);
  url.searchParams.set('X-Amz-Expires', String(ttl));
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
  const signed = await client.sign(new Request(url, { method }), { aws: { signQuery: true } });
  return signed.url;
}

function requireKey(env: Env): string {
  if (!env.SIGNING_KEY) throw new Error('SIGNING_KEY secret is not set');
  return env.SIGNING_KEY;
}

async function fileUrl(env: Env, m: Material, token: string, origin: string, path: string): Promise<string> {
  if (canPresign(env)) return presign(env, materialPrefix(m.id) + path, 'GET', ACCESS_TTL);
  return `${origin}/api/file/${token}/${encodePath(path)}`;
}

export async function buildAccess(env: Env, m: Material, origin: string, allowDownload: boolean): Promise<MaterialAccess> {
  const token = m.audio_file || (m.ready && !['embed', 'note'].includes(m.kind)) || (m.kind === 'note' && m.file_name) ? await signToken(requireKey(env), m.id, ACCESS_TTL) : '';
  const extra: MaterialAccess = m.audio_file ? { audioUrl: await fileUrl(env, m, token, origin, m.audio_file) } : {};
  if (m.kind === 'embed') return { ...extra, embedUrl: m.embed_url ?? undefined };
  if (m.kind === 'note' && !m.file_name) return { ...extra, bodyMd: m.body_md ?? '' };
  if (!m.ready) return extra;

  if (m.kind === 'html') {
    // Published / link-only HTML lessons are standalone pages at /topic/<slug>/ (served untouched).
    if (m.status !== 'draft') return { ...extra, bundleUrl: `${origin}/topic/${encodeURIComponent(m.slug)}/` };
    const base = env.CONTENT_ORIGIN ? env.CONTENT_ORIGIN.replace(/\/$/, '') : `${origin}/api/bundle`;
    return { ...extra, bundleUrl: `${base}/b/${token}/${encodePath(m.entry_path || 'index.html')}` };
  }

  const fileName = m.file_name ?? '';
  const key = materialPrefix(m.id) + fileName;
  const downloadName = fileName.split('/').pop() || 'download';
  const access: MaterialAccess = { ...extra };
  if (canPresign(env)) {
    access.fileUrl = await presign(env, key, 'GET', ACCESS_TTL);
    if (allowDownload) {
      access.downloadUrl = await presign(env, key, 'GET', ACCESS_TTL, {
        'response-content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
      });
    }
  } else {
    access.fileUrl = `${origin}/api/file/${token}/${encodePath(fileName)}`;
    if (allowDownload) access.downloadUrl = `${access.fileUrl}?dl=1`;
  }
  if (m.kind === 'note') access.bodyMd = m.body_md ?? '';
  return access;
}

/** Stream an R2 object with Range + conditional request support. */
export async function serveObject(
  env: Env,
  key: string,
  req: Request,
  opts: { download?: string; cacheControl?: string; extraHeaders?: Record<string, string> } = {},
): Promise<Response> {
  const hasRange = req.headers.has('Range');
  const obj = await env.BUCKET.get(key, { range: req.headers, onlyIf: req.headers });
  if (!obj) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  // Trust the file extension over whatever Content-Type the uploader sent.
  const byExt = mimeFor(key);
  if (byExt !== 'application/octet-stream' || !headers.get('Content-Type')) headers.set('Content-Type', byExt);
  headers.set('ETag', obj.httpEtag);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', opts.cacheControl ?? 'private, max-age=3600');
  headers.set('X-Content-Type-Options', 'nosniff');
  for (const [k, v] of Object.entries(opts.extraHeaders ?? {})) headers.set(k, v);
  if (opts.download) {
    headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(opts.download)}`);
  }

  if (!('body' in obj) || !obj.body) return new Response(null, { status: 304, headers });

  const r = obj.range as { offset?: number; length?: number; suffix?: number } | undefined;
  if (hasRange && r) {
    let offset: number;
    let length: number;
    if (r.suffix !== undefined) {
      length = Math.min(r.suffix, obj.size);
      offset = obj.size - length;
    } else {
      offset = r.offset ?? 0;
      length = r.length ?? obj.size - offset;
    }
    headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${obj.size}`);
    headers.set('Content-Length', String(length));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set('Content-Length', String(obj.size));
  return new Response(obj.body, { status: 200, headers });
}

export async function listPrefix(env: Env, prefix: string) {
  let cursor: string | undefined;
  let total = 0;
  const keys: { key: string; size: number }[] = [];
  do {
    const page = await env.BUCKET.list({ prefix, cursor, limit: 1000 });
    for (const o of page.objects) {
      total += o.size;
      if (keys.length < 5000) keys.push({ key: o.key, size: o.size });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return { total, keys };
}

export async function deletePrefix(env: Env, prefix: string) {
  let cursor: string | undefined;
  do {
    const page = await env.BUCKET.list({ prefix, cursor, limit: 1000 });
    if (page.objects.length) await env.BUCKET.delete(page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

export async function usedBytes(env: Env, ownerId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT
       (SELECT COALESCE(SUM(size_bytes), 0) FROM materials WHERE owner_id = ?1) +
       (SELECT COALESCE(SUM(size_bytes), 0) FROM assets WHERE owner_id = ?1) AS used`,
  )
    .bind(ownerId)
    .first<{ used: number }>();
  return Number(row?.used ?? 0);
}
