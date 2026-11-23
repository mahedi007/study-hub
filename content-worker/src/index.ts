// Serves teacher-uploaded HTML bundles from R2 on a separate origin.
// URL shape: /b/<signed token>/<path inside the bundle>
import { materialPrefix, safePath, verifyToken } from '../../server/tokens';
import { mimeFor } from '../../shared/design';

interface Env {
  BUCKET: R2Bucket;
  SIGNING_KEY: string;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, HEAD' } });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
    if (url.pathname === '/' || url.pathname === '/health') return new Response('study-hub content ok');

    const m = /^\/b\/([^/]+)\/?(.*)$/.exec(url.pathname);
    if (!m) return new Response('Not found', { status: 404 });
    const id = await verifyToken(env.SIGNING_KEY, m[1]);
    if (!id) return new Response('This lesson link has expired. Go back and open it again.', { status: 403 });

    let rel: string;
    try {
      rel = m[2].split('/').map(decodeURIComponent).join('/');
    } catch {
      return new Response('Bad path', { status: 400 });
    }
    if (!rel || rel.endsWith('/')) rel += 'index.html';
    const path = safePath(rel);
    if (!path) return new Response('Bad path', { status: 400 });

    const key = materialPrefix(id) + path;
    const obj = await env.BUCKET.get(key, { range: req.headers, onlyIf: req.headers });
    if (!obj) return new Response('File not found in this lesson', { status: 404 });

    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set('Content-Type', mimeFor(path) !== 'application/octet-stream' ? mimeFor(path) : headers.get('Content-Type') ?? 'application/octet-stream');
    headers.set('ETag', obj.httpEtag);
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Cache-Control', 'private, max-age=3600');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'no-referrer');

    if (!('body' in obj) || !obj.body) return new Response(null, { status: 304, headers });
    const r = obj.range as { offset?: number; length?: number; suffix?: number } | undefined;
    if (req.headers.has('Range') && r) {
      const length = r.suffix !== undefined ? Math.min(r.suffix, obj.size) : (r.length ?? obj.size - (r.offset ?? 0));
      const offset = r.suffix !== undefined ? obj.size - length : (r.offset ?? 0);
      headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${obj.size}`);
      headers.set('Content-Length', String(length));
      return new Response(req.method === 'HEAD' ? null : obj.body, { status: 206, headers });
    }
    headers.set('Content-Length', String(obj.size));
    return new Response(req.method === 'HEAD' ? null : obj.body, { headers });
  },
};
