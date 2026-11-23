import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { fail } from '../env';
import { assertOwner } from '../auth';
import { audit, clampStr, getSettings, mapMaterial, newId, now } from '../util';
import { buildAccess, canPresign, deletePrefix, encodePath, listPrefix, presign, usedBytes } from '../storage';
import { materialPrefix, safePath } from '../tokens';
import { kindFromFileName, mimeFor } from '../../shared/design';
import type { Material, MaterialKind } from '../../shared/types';

const KINDS: MaterialKind[] = ['pdf', 'doc', 'slides', 'sheet', 'audio', 'video', 'image', 'html', 'embed', 'note', 'file'];
const STATUSES = ['draft', 'unlisted', 'published'];
export const PROXY_UPLOAD_LIMIT = 95 * 1024 * 1024;

const r = new Hono<AppEnv>();

async function loadMaterial(c: any, id: string): Promise<Material> {
  const row = await c.env.DB.prepare(`SELECT * FROM materials WHERE id = ?`).bind(id).first();
  if (!row) fail(404, 'Material not found');
  const m = mapMaterial(row);
  assertOwner(c.get('user'), m.owner_id);
  return m;
}

function normalizeEmbed(url: string): string {
  const u = url.trim();
  const yt = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/.exec(u);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const drive = /drive\.google\.com\/file\/d\/([\w-]+)/.exec(u);
  if (drive) return `https://drive.google.com/file/d/${drive[1]}/preview`;
  const vimeo = /vimeo\.com\/(\d+)/.exec(u);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  if (/facebook\.com\/.+\/videos\//.test(u) || /fb\.watch\//.test(u)) {
    return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(u)}&show_text=false`;
  }
  return u;
}

function pickFields(body: any) {
  const out: Record<string, unknown> = {};
  if (body.title !== undefined) out.title = clampStr(body.title, 200) || 'Untitled';
  if (body.description !== undefined) out.description = clampStr(body.description, 4000);
  if (body.subject !== undefined) out.subject = clampStr(body.subject, 80);
  if (body.class_level !== undefined) out.class_level = clampStr(body.class_level, 80);
  if (body.tags !== undefined) {
    const tags = Array.isArray(body.tags) ? body.tags.map((t: unknown) => String(t).trim().slice(0, 40)).filter(Boolean).slice(0, 20) : [];
    out.tags = JSON.stringify(tags);
  }
  if (body.status !== undefined && STATUSES.includes(body.status)) out.status = body.status;
  if (body.allow_download !== undefined) out.allow_download = body.allow_download ? 1 : 0;
  if (body.cover_asset !== undefined) out.cover_asset = body.cover_asset || null;
  if (body.embed_url !== undefined) out.embed_url = body.embed_url ? normalizeEmbed(String(body.embed_url)) : null;
  if (body.body_md !== undefined) out.body_md = clampStr(body.body_md, 200_000);
  if (body.kind !== undefined && KINDS.includes(body.kind)) out.kind = body.kind;
  if (body.entry_path !== undefined) out.entry_path = body.entry_path ? safePath(String(body.entry_path)) : null;
  if (body.icon !== undefined) out.icon = clampStr(body.icon, 16);
  if (body.audio_file !== undefined) out.audio_file = body.audio_file ? safePath(String(body.audio_file)) : null;
  return out;
}

r.get('/materials', async (c) => {
  const user = c.get('user');
  const all = user.role === 'admin' && c.req.query('scope') === 'all';
  const stmt = all
    ? c.env.DB.prepare(
        `SELECT m.*, u.name AS owner_name, u.email AS owner_email, u.handle AS owner_handle
         FROM materials m JOIN users u ON u.id = m.owner_id ORDER BY m.updated_at DESC LIMIT 3000`,
      )
    : c.env.DB.prepare(`SELECT * FROM materials WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 3000`).bind(user.id);
  const { results } = await stmt.all();
  return c.json({ materials: results.map(mapMaterial) });
});

r.post('/materials', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const kind: MaterialKind = KINDS.includes(body.kind) ? body.kind : 'file';
  const f = pickFields(body);
  const id = newId();
  const t = now();
  const ready = kind === 'embed' || kind === 'note' ? 1 : 0;
  if (kind === 'embed' && !f.embed_url) fail(400, 'Embed URL is required');
  await c.env.DB.prepare(
    `INSERT INTO materials (id, owner_id, title, description, kind, icon, embed_url, body_md, subject, class_level, tags, cover_asset, status, allow_download, ready, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      user.id,
      (f.title as string) || 'Untitled',
      (f.description as string) ?? '',
      kind,
      (f.icon as string) ?? '',
      (f.embed_url as string) ?? null,
      (f.body_md as string) ?? null,
      (f.subject as string) ?? '',
      (f.class_level as string) ?? '',
      (f.tags as string) ?? '[]',
      (f.cover_asset as string) ?? null,
      (f.status as string) ?? 'draft',
      f.allow_download === undefined ? 1 : (f.allow_download as number),
      ready,
      t,
      t,
    )
    .run();
  await audit(c.env, user, 'material.create', id, { kind, title: f.title });
  const row = await c.env.DB.prepare(`SELECT * FROM materials WHERE id = ?`).bind(id).first();
  return c.json({ material: mapMaterial(row!) }, 201);
});

r.get('/materials/:id', async (c) => {
  const m = await loadMaterial(c, c.req.param('id'));
  const origin = new URL(c.req.url).origin;
  const [collections, links, files, access] = await Promise.all([
    c.env.DB.prepare(
      `SELECT c.id, c.title FROM collection_items ci JOIN collections c ON c.id = ci.collection_id WHERE ci.material_id = ?`,
    )
      .bind(m.id)
      .all(),
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM share_links WHERE target_type = 'material' AND target_id = ?`).bind(m.id).first<{ n: number }>(),
    m.kind === 'html' && m.ready ? listPrefix(c.env, materialPrefix(m.id)) : Promise.resolve(null),
    buildAccess(c.env, m, origin, true).catch(() => ({})),
  ]);
  const prefix = materialPrefix(m.id);
  return c.json({
    material: m,
    collections: collections.results,
    link_count: Number(links?.n ?? 0),
    files: files ? files.keys.slice(0, 500).map((k) => ({ path: k.key.slice(prefix.length), size: k.size })) : [],
    access,
  });
});

r.patch('/materials/:id', async (c) => {
  const user = c.get('user');
  const m = await loadMaterial(c, c.req.param('id'));
  const f = pickFields(await c.req.json());
  const keys = Object.keys(f);
  if (!keys.length) return c.json({ material: m });
  if (m.kind === 'embed' || f.kind === 'embed') {
    if (f.embed_url !== undefined || f.kind === 'embed') f.ready = f.embed_url || m.embed_url ? 1 : 0;
  }
  if (f.kind === 'note' && !m.file_name) f.ready = 1;
  const cols = Object.keys(f);
  await c.env.DB.prepare(`UPDATE materials SET ${cols.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
    .bind(...cols.map((k) => f[k]), now(), m.id)
    .run();
  if (f.status && f.status !== m.status) await audit(c.env, user, `material.${f.status}`, m.id, { title: m.title });
  const row = await c.env.DB.prepare(`SELECT * FROM materials WHERE id = ?`).bind(m.id).first();
  return c.json({ material: mapMaterial(row!) });
});

async function deleteMaterial(c: any, m: Material) {
  await deletePrefix(c.env, `m/${m.id}/`);
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM share_links WHERE target_type = 'material' AND target_id = ?`).bind(m.id),
    c.env.DB.prepare(`DELETE FROM collection_items WHERE material_id = ?`).bind(m.id),
    c.env.DB.prepare(`DELETE FROM materials WHERE id = ?`).bind(m.id),
  ]);
}

r.delete('/materials/:id', async (c) => {
  const m = await loadMaterial(c, c.req.param('id'));
  await deleteMaterial(c, m);
  await audit(c.env, c.get('user'), 'material.delete', m.id, { title: m.title });
  return c.json({ ok: true });
});

r.post('/materials/bulk', async (c) => {
  const user = c.get('user');
  const { ids, action } = await c.req.json<{ ids: string[]; action: string }>();
  if (!Array.isArray(ids) || !ids.length) fail(400, 'No materials selected');
  let done = 0;
  for (const id of ids.slice(0, 200)) {
    const row = await c.env.DB.prepare(`SELECT * FROM materials WHERE id = ?`).bind(id).first();
    if (!row) continue;
    const m = mapMaterial(row);
    if (user.role !== 'admin' && m.owner_id !== user.id) continue;
    if (action === 'delete') await deleteMaterial(c, m);
    else if (STATUSES.includes(action)) {
      await c.env.DB.prepare(`UPDATE materials SET status = ?, updated_at = ? WHERE id = ?`).bind(action, now(), id).run();
    } else if (action === 'allow_download' || action === 'block_download') {
      await c.env.DB.prepare(`UPDATE materials SET allow_download = ?, updated_at = ? WHERE id = ?`)
        .bind(action === 'allow_download' ? 1 : 0, now(), id)
        .run();
    } else fail(400, 'Unknown action');
    done++;
  }
  await audit(c.env, user, `material.bulk.${action}`, undefined, { count: done });
  return c.json({ ok: true, count: done });
});

r.post('/materials/:id/duplicate', async (c) => {
  const user = c.get('user');
  const m = await loadMaterial(c, c.req.param('id'));
  if (!['embed', 'note'].includes(m.kind)) fail(400, 'Only embeds and notes can be duplicated (files would double your storage).');
  const id = newId();
  const t = now();
  await c.env.DB.prepare(
    `INSERT INTO materials (id, owner_id, title, description, kind, icon, embed_url, body_md, subject, class_level, tags, cover_asset, status, allow_download, ready, created_at, updated_at)
     SELECT ?, owner_id, title || ' (copy)', description, kind, icon, embed_url, body_md, subject, class_level, tags, cover_asset, 'draft', allow_download, ready, ?, ? FROM materials WHERE id = ?`,
  )
    .bind(id, t, t, m.id)
    .run();
  await audit(c.env, user, 'material.duplicate', id, { from: m.id });
  const row = await c.env.DB.prepare(`SELECT * FROM materials WHERE id = ?`).bind(id).first();
  return c.json({ material: mapMaterial(row!) });
});

// ---------- Uploads ----------

r.post('/materials/:id/upload-targets', async (c) => {
  const user = c.get('user');
  const m = await loadMaterial(c, c.req.param('id'));
  const { files } = await c.req.json<{ files: { path: string; size: number; type?: string }[] }>();
  if (!Array.isArray(files) || !files.length) fail(400, 'No files');
  if (files.length > 100) fail(400, 'Request at most 100 upload targets at a time');

  const settings = await getSettings(c.env);
  const maxFile = settings.maxFileMb > 0 ? settings.maxFileMb * 1024 * 1024 : Infinity;
  const presignOk = canPresign(c.env);
  const incoming = files.reduce((s, f) => s + Math.max(0, Number(f.size) || 0), 0);

  const owner =
    m.owner_id === user.id ? user : await c.env.DB.prepare(`SELECT quota_bytes FROM users WHERE id = ?`).bind(m.owner_id).first<{ quota_bytes: number }>();
  const quota = Number(owner?.quota_bytes ?? 0);
  const used = await usedBytes(c.env, m.owner_id);
  if (quota > 0 && used + incoming > quota) {
    fail(413, `Storage quota exceeded: ${(used / 1048576).toFixed(1)} MB used of ${(quota / 1048576).toFixed(0)} MB.`);
  }

  const targets = [];
  for (const f of files) {
    const path = safePath(f.path);
    if (!path) fail(400, `Invalid path: ${f.path}`);
    const size = Number(f.size) || 0;
    if (size > maxFile) fail(413, `${path} is larger than the ${settings.maxFileMb} MB limit.`);
    if (!presignOk && size > PROXY_UPLOAD_LIMIT) {
      fail(413, `${path} is over 95 MB. Configure R2 API credentials for direct uploads of large files.`);
    }
    const key = materialPrefix(m.id) + path;
    const type = f.type || mimeFor(path);
    targets.push({
      path,
      method: 'PUT',
      url: presignOk ? await presign(c.env, key, 'PUT', 3600) : `/api/admin/upload/${m.id}/${encodePath(path)}`,
      headers: { 'Content-Type': type },
      direct: presignOk,
    });
  }
  return c.json({ targets });
});

r.put('/upload/:id/*', async (c) => {
  const m = await loadMaterial(c, c.req.param('id'));
  const prefix = `/api/admin/upload/${m.id}/`;
  const raw = new URL(c.req.url).pathname;
  const rel = raw.startsWith(prefix) ? raw.slice(prefix.length) : '';
  const path = safePath(rel.split('/').map(decodeURIComponent).join('/'));
  if (!path) fail(400, 'Invalid path');
  const len = Number(c.req.header('Content-Length') ?? 0);
  if (len > PROXY_UPLOAD_LIMIT) fail(413, 'File too large for proxied upload');
  if (!c.req.raw.body) fail(400, 'Empty body');
  await c.env.BUCKET.put(materialPrefix(m.id) + path!, c.req.raw.body, {
    httpMetadata: { contentType: mimeFor(path!) !== 'application/octet-stream' ? mimeFor(path!) : c.req.header('Content-Type') || 'application/octet-stream' },
  });
  return c.json({ ok: true, path });
});

r.post('/materials/:id/finalize', async (c) => {
  const user = c.get('user');
  const m = await loadMaterial(c, c.req.param('id'));
  const body = await c.req.json<{ entryPath?: string; mainFile?: string; kind?: MaterialKind }>().catch(() => ({}) as any);
  const prefix = materialPrefix(m.id);
  const { total, keys } = await listPrefix(c.env, prefix);
  if (!keys.length) fail(400, 'No files were uploaded');
  const allPaths = keys.map((k) => k.key.slice(prefix.length));
  // Lecture audio lives under _audio/ and never counts as the main file.
  const paths = allPaths.filter((p) => !p.startsWith('_audio/'));
  if (!paths.length && m.kind !== 'embed' && m.kind !== 'note') fail(400, 'No main file was uploaded');

  if (!paths.length) {
    await c.env.DB.prepare(`UPDATE materials SET size_bytes = ?, file_count = ?, updated_at = ? WHERE id = ?`).bind(total, keys.length, now(), m.id).run();
    const row = await c.env.DB.prepare(`SELECT * FROM materials WHERE id = ?`).bind(m.id).first();
    return c.json({ material: mapMaterial(row!) });
  }
  let kind: MaterialKind = body.kind && KINDS.includes(body.kind) ? body.kind : m.kind;
  let fileName: string | null = null;
  let entry: string | null = null;

  const htmlFiles = paths.filter((p) => /\.html?$/i.test(p));
  if (kind === 'html' || (paths.length > 1 && htmlFiles.length)) {
    kind = 'html';
    const wanted = body.entryPath ? safePath(body.entryPath) : null;
    entry =
      (wanted && paths.includes(wanted) ? wanted : null) ??
      htmlFiles.filter((p) => /(^|\/)index\.html?$/i.test(p)).sort((a, b) => a.split('/').length - b.split('/').length)[0] ??
      htmlFiles.sort((a, b) => a.split('/').length - b.split('/').length)[0] ??
      null;
    if (!entry) fail(400, 'The folder has no .html file to open. Add an index.html.');
    fileName = entry;
  } else {
    const wanted = body.mainFile ? safePath(body.mainFile) : null;
    fileName = wanted && paths.includes(wanted) ? wanted : paths[0];
    if (kind === 'file' || !m.ready) {
      const guessed = kindFromFileName(fileName);
      if (kind === 'file' || kind !== guessed) kind = guessed === 'html' ? 'file' : guessed;
    }
  }

  await c.env.DB.prepare(
    `UPDATE materials SET kind = ?, file_name = ?, entry_path = ?, mime = ?, size_bytes = ?, file_count = ?, ready = 1, updated_at = ? WHERE id = ?`,
  )
    .bind(kind, fileName, entry, fileName ? mimeFor(fileName) : null, total, keys.length, now(), m.id)
    .run();
  await audit(c.env, user, 'material.upload', m.id, { files: keys.length, bytes: total });
  const row = await c.env.DB.prepare(`SELECT * FROM materials WHERE id = ?`).bind(m.id).first();
  return c.json({ material: mapMaterial(row!) });
});

r.post('/materials/:id/reset-files', async (c) => {
  const m = await loadMaterial(c, c.req.param('id'));
  const scope = c.req.query('scope') === 'audio' ? 'audio' : 'main';
  const prefix = materialPrefix(m.id);
  if (scope === 'audio') {
    await deletePrefix(c.env, `${prefix}_audio/`);
    await c.env.DB.prepare(`UPDATE materials SET audio_file = NULL, updated_at = ? WHERE id = ?`).bind(now(), m.id).run();
  } else {
    // Delete everything except the lecture audio.
    const { keys } = await listPrefix(c.env, prefix);
    const doomed = keys.filter((k) => !k.key.startsWith(`${prefix}_audio/`)).map((k) => k.key);
    for (let i = 0; i < doomed.length; i += 1000) await c.env.BUCKET.delete(doomed.slice(i, i + 1000));
    await c.env.DB.prepare(
      `UPDATE materials SET file_name = NULL, entry_path = NULL, ready = CASE WHEN kind IN ('embed','note') THEN 1 ELSE 0 END, updated_at = ? WHERE id = ?`,
    )
      .bind(now(), m.id)
      .run();
  }
  const { total, keys } = await listPrefix(c.env, prefix);
  await c.env.DB.prepare(`UPDATE materials SET size_bytes = ?, file_count = ? WHERE id = ?`).bind(total, keys.length, m.id).run();
  return c.json({ ok: true });
});

/** Attach (after uploading to _audio/<name>) or detach a lecture audio file. */
r.post('/materials/:id/audio', async (c) => {
  const m = await loadMaterial(c, c.req.param('id'));
  const { path } = await c.req.json<{ path: string }>();
  const p = safePath(String(path ?? ''));
  if (!p || !p.startsWith('_audio/')) fail(400, 'Invalid audio path');
  const prefix = materialPrefix(m.id);
  const head = await c.env.BUCKET.head(prefix + p);
  if (!head) fail(400, 'Audio file was not uploaded');
  // Keep only the newest audio file.
  const { keys } = await listPrefix(c.env, `${prefix}_audio/`);
  const old = keys.map((k) => k.key).filter((k) => k !== prefix + p);
  if (old.length) await c.env.BUCKET.delete(old);
  const { total, keys: all } = await listPrefix(c.env, prefix);
  await c.env.DB.prepare(`UPDATE materials SET audio_file = ?, size_bytes = ?, file_count = ?, updated_at = ? WHERE id = ?`)
    .bind(p, total, all.length, now(), m.id)
    .run();
  const row = await c.env.DB.prepare(`SELECT * FROM materials WHERE id = ?`).bind(m.id).first();
  return c.json({ material: mapMaterial(row!) });
});

export default r;
