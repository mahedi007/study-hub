// /topic/<slug>  → the material page.
// For HTML/folder lessons the uploaded page itself is served here, byte-for-byte, as a standalone page
// (relative links to its CSS/JS/images/audio keep working: /topic/<slug>/css/style.css …).
// Every other material type is rendered by the React app.
import type { Env } from '../../server/env';
import { serveObject, encodePath } from '../../server/storage';
import { materialPrefix, safePath } from '../../server/tokens';
import { today } from '../../server/util';

type Ctx = { request: Request; env: Env; waitUntil: (p: Promise<unknown>) => void };

function spa(ctx: Ctx) {
  return ctx.env.ASSETS!.fetch(new Request(new URL('/', ctx.request.url).toString(), { headers: ctx.request.headers }));
}

export const onRequest = async (ctx: Ctx): Promise<Response> => {
  const { request, env } = ctx;
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean); // ['topic', slug, ...rest]
  let slug = '';
  let rest: string[] = [];
  try {
    slug = decodeURIComponent(parts[1] ?? '').toLowerCase();
    rest = parts.slice(2).map(decodeURIComponent);
  } catch {
    return new Response('Bad URL', { status: 400 });
  }
  if (!slug) return Response.redirect(`${url.origin}/`, 302);

  const m = await env.DB.prepare(
    `SELECT m.id, m.owner_id, m.kind, m.entry_path, m.ready FROM materials m JOIN users u ON u.id = m.owner_id
     WHERE m.slug = ? AND m.status != 'draft' AND u.status = 'active'`,
  )
    .bind(slug)
    .first<{ id: string; owner_id: string; kind: string; entry_path: string | null; ready: number }>();

  if (!m || m.kind !== 'html' || !m.ready) return spa(ctx);

  const entry = m.entry_path || 'index.html';
  if (!rest.length) {
    // Folder-style URL so the lesson's relative links resolve: /topic/slug → /topic/slug/
    if (!url.pathname.endsWith('/')) return Response.redirect(`${url.origin}/topic/${encodeURIComponent(slug)}/${url.search}`, 301);
    if (entry !== 'index.html') {
      const target = entry.endsWith('/index.html') ? entry.slice(0, -'index.html'.length) : entry;
      return Response.redirect(`${url.origin}/topic/${encodeURIComponent(slug)}/${encodePath(target)}${url.search}`, 302);
    }
  }
  let rel = rest.join('/');
  if (!rel || url.pathname.endsWith('/')) rel = rel ? `${rel}/index.html` : 'index.html';
  const path = safePath(rel);
  if (!path) return new Response('Bad path', { status: 400 });

  if (path === entry && request.method === 'GET') {
    ctx.waitUntil(
      env.DB.batch([
        env.DB.prepare(`UPDATE materials SET view_count = view_count + 1 WHERE id = ?`).bind(m.id),
        env.DB.prepare(`INSERT INTO daily_views (owner_id, day, views) VALUES (?, ?, 1) ON CONFLICT(owner_id, day) DO UPDATE SET views = views + 1`).bind(m.owner_id, today()),
      ]).catch(() => undefined),
    );
  }
  const res = await serveObject(env, materialPrefix(m.id) + path, request, { cacheControl: 'public, max-age=60' });
  if (res.status === 404 && path === entry) return spa(ctx);
  return res;
};
