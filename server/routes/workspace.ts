import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { fail } from '../env';
import { assertOwner, requireAdmin, hashPassword, issueSession, superAdminEmail, validatePassword, verifyPassword } from '../auth';
import {
  assetUrl,
  audit,
  clampStr,
  getSettings,
  hashPasscode,
  mapAnnouncement,
  mapCollection,
  mapLink,
  mapMaterial,
  newId,
  newSlug,
  now,
  slugifyHandle,
} from '../util';
import { canPresign, usedBytes } from '../storage';
import { PROXY_UPLOAD_LIMIT } from './materials';
import { assetKey } from '../tokens';
import { normalizeDesign } from '../../shared/design';
import { buildSiteData, siteDesign } from './public';

const r = new Hono<AppEnv>();

// ---------- Me / dashboard ----------

r.get('/me', async (c) => {
  const user = c.get('user');
  const [settings, used] = await Promise.all([getSettings(c.env), usedBytes(c.env, user.id)]);
  return c.json({
    user: { ...user, used_bytes: used, avatar_url: assetUrl(user.avatar_asset) },
    settings,
    capabilities: {
      presign: canPresign(c.env),
      contentOrigin: !!c.env.CONTENT_ORIGIN,
      google: !!(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET),
      maxProxyUploadBytes: PROXY_UPLOAD_LIMIT,
    },
    signingKey: !!c.env.SIGNING_KEY,
    isSuperAdmin: user.email === superAdminEmail(c.env),
  });
});

r.patch('/me', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (body.name !== undefined) {
    sets.push('name = ?');
    vals.push(clampStr(body.name, 120));
  }
  if (body.bio !== undefined) {
    sets.push('bio = ?');
    vals.push(clampStr(body.bio, 2000));
  }
  if (body.avatar_asset !== undefined) {
    sets.push('avatar_asset = ?');
    vals.push(body.avatar_asset || null);
  }
  if (body.handle !== undefined) {
    const handle = slugifyHandle(String(body.handle));
    if (handle.length < 3) fail(400, 'Handle must be at least 3 characters (a-z, 0-9, -)');
    const taken = await c.env.DB.prepare(`SELECT id FROM users WHERE handle = ? AND id != ?`).bind(handle, user.id).first();
    if (taken) fail(409, 'That handle is already taken');
    sets.push('handle = ?');
    vals.push(handle);
  }
  if (sets.length) {
    await c.env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, user.id).run();
  }
  return c.json({ ok: true });
});

r.post('/me/password', async (c) => {
  const user = c.get('user');
  const b = await c.req.json();
  const row = await c.env.DB.prepare(`SELECT password_hash, session_version FROM users WHERE id = ?`).bind(user.id).first<any>();
  if (row?.password_hash && !(await verifyPassword(c.env, String(b.current ?? ''), row.password_hash))) fail(400, 'Current password is wrong');
  const next = validatePassword(b.next);
  const version = Number(row?.session_version ?? 1) + 1;
  await c.env.DB.prepare(`UPDATE users SET password_hash = ?, session_version = ? WHERE id = ?`).bind(await hashPassword(c.env, next), version, user.id).run();
  await issueSession(c, { id: user.id, session_version: version });
  return c.json({ ok: true });
});

r.post('/me/logout-all', async (c) => {
  const user = c.get('user');
  const row = await c.env.DB.prepare(`SELECT session_version FROM users WHERE id = ?`).bind(user.id).first<any>();
  const version = Number(row?.session_version ?? 1) + 1;
  await c.env.DB.prepare(`UPDATE users SET session_version = ? WHERE id = ?`).bind(version, user.id).run();
  await issueSession(c, { id: user.id, session_version: version });
  return c.json({ ok: true });
});

r.get('/dashboard', async (c) => {
  const user = c.get('user');
  const since = new Date(Date.now() - 13 * 86400000).toISOString().slice(0, 10);
  const [counts, views, top, recent, used] = await Promise.all([
    c.env.DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM materials WHERE owner_id = ?1) AS materials,
        (SELECT COUNT(*) FROM materials WHERE owner_id = ?1 AND status = 'published') AS published,
        (SELECT COUNT(*) FROM collections WHERE owner_id = ?1) AS collections,
        (SELECT COUNT(*) FROM share_links WHERE owner_id = ?1 AND active = 1) AS links,
        (SELECT COALESCE(SUM(view_count), 0) FROM materials WHERE owner_id = ?1) AS views`,
    )
      .bind(user.id)
      .first(),
    c.env.DB.prepare(`SELECT day, views FROM daily_views WHERE owner_id = ? AND day >= ? ORDER BY day`).bind(user.id, since).all(),
    c.env.DB.prepare(`SELECT * FROM materials WHERE owner_id = ? ORDER BY view_count DESC LIMIT 5`).bind(user.id).all(),
    c.env.DB.prepare(`SELECT * FROM materials WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 6`).bind(user.id).all(),
    usedBytes(c.env, user.id),
  ]);
  const byDay = new Map((views.results as { day: string; views: number }[]).map((v) => [v.day, Number(v.views)]));
  const series = Array.from({ length: 14 }, (_, i) => {
    const day = new Date(Date.now() - (13 - i) * 86400000).toISOString().slice(0, 10);
    return { day, views: byDay.get(day) ?? 0 };
  });
  return c.json({
    counts,
    series,
    top: top.results.map(mapMaterial),
    recent: recent.results.map(mapMaterial),
    storage: { used, quota: user.quota_bytes },
  });
});

// ---------- Collections ----------

async function loadCollection(c: any, id: string) {
  const row = await c.env.DB.prepare(`SELECT * FROM collections WHERE id = ?`).bind(id).first();
  if (!row) fail(404, 'Collection not found');
  const col = mapCollection(row);
  assertOwner(c.get('user'), col.owner_id);
  return col;
}

r.get('/collections', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    `SELECT c.*, (SELECT COUNT(*) FROM collection_items ci WHERE ci.collection_id = c.id) AS item_count
     FROM collections c WHERE owner_id = ? ORDER BY updated_at DESC`,
  )
    .bind(user.id)
    .all();
  return c.json({ collections: results.map(mapCollection) });
});

r.post('/collections', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const id = newId();
  const t = now();
  await c.env.DB.prepare(
    `INSERT INTO collections (id, owner_id, title, description, cover_asset, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, user.id, clampStr(body.title, 200) || 'Untitled collection', clampStr(body.description, 4000), body.cover_asset || null, ['draft', 'unlisted', 'published'].includes(body.status) ? body.status : 'draft', t, t)
    .run();
  await audit(c.env, user, 'collection.create', id);
  const row = await c.env.DB.prepare(`SELECT * FROM collections WHERE id = ?`).bind(id).first();
  return c.json({ collection: mapCollection(row!) }, 201);
});

r.get('/collections/:id', async (c) => {
  const col = await loadCollection(c, c.req.param('id'));
  const { results } = await c.env.DB.prepare(
    `SELECT ci.section, ci.position, m.* FROM collection_items ci JOIN materials m ON m.id = ci.material_id
     WHERE ci.collection_id = ? ORDER BY ci.position`,
  )
    .bind(col.id)
    .all();
  return c.json({
    collection: col,
    items: results.map((r: any) => ({ material_id: r.id, section: r.section, position: r.position, material: mapMaterial(r) })),
  });
});

r.patch('/collections/:id', async (c) => {
  const col = await loadCollection(c, c.req.param('id'));
  const body = await c.req.json();
  const f: Record<string, unknown> = {};
  if (body.title !== undefined) f.title = clampStr(body.title, 200) || 'Untitled collection';
  if (body.description !== undefined) f.description = clampStr(body.description, 4000);
  if (body.cover_asset !== undefined) f.cover_asset = body.cover_asset || null;
  if (body.status !== undefined && ['draft', 'unlisted', 'published'].includes(body.status)) f.status = body.status;
  const cols = Object.keys(f);
  if (cols.length) {
    await c.env.DB.prepare(`UPDATE collections SET ${cols.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
      .bind(...cols.map((k) => f[k]), now(), col.id)
      .run();
  }
  const row = await c.env.DB.prepare(`SELECT * FROM collections WHERE id = ?`).bind(col.id).first();
  return c.json({ collection: mapCollection(row!) });
});

r.delete('/collections/:id', async (c) => {
  const col = await loadCollection(c, c.req.param('id'));
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM share_links WHERE target_type = 'collection' AND target_id = ?`).bind(col.id),
    c.env.DB.prepare(`DELETE FROM collection_items WHERE collection_id = ?`).bind(col.id),
    c.env.DB.prepare(`DELETE FROM collections WHERE id = ?`).bind(col.id),
  ]);
  await audit(c.env, c.get('user'), 'collection.delete', col.id, { title: col.title });
  return c.json({ ok: true });
});

r.put('/collections/:id/items', async (c) => {
  const col = await loadCollection(c, c.req.param('id'));
  const { items } = await c.req.json<{ items: { material_id: string; section?: string }[] }>();
  if (!Array.isArray(items)) fail(400, 'items must be an array');
  const ids = [...new Set(items.map((i) => i.material_id))].slice(0, 500);
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    const { results } = await c.env.DB.prepare(`SELECT id FROM materials WHERE owner_id = ? AND id IN (${placeholders})`)
      .bind(col.owner_id, ...ids)
      .all<{ id: string }>();
    const valid = new Set(results.map((r) => r.id));
    if (valid.size !== ids.length) fail(400, 'Some materials do not belong to this collection owner');
  }
  const seen = new Set<string>();
  const stmts = [c.env.DB.prepare(`DELETE FROM collection_items WHERE collection_id = ?`).bind(col.id)];
  items.forEach((it, i) => {
    if (seen.has(it.material_id)) return;
    seen.add(it.material_id);
    stmts.push(
      c.env.DB.prepare(`INSERT INTO collection_items (collection_id, material_id, section, position) VALUES (?, ?, ?, ?)`).bind(
        col.id,
        it.material_id,
        clampStr(it.section ?? '', 120),
        i,
      ),
    );
  });
  stmts.push(c.env.DB.prepare(`UPDATE collections SET updated_at = ? WHERE id = ?`).bind(now(), col.id));
  await c.env.DB.batch(stmts);
  return c.json({ ok: true, count: seen.size });
});

// ---------- Share links ----------

async function targetOwner(c: any, type: string, id: string): Promise<string> {
  if (type === 'page') return id;
  const table = type === 'material' ? 'materials' : type === 'collection' ? 'collections' : null;
  if (!table) fail(400, 'Invalid target type');
  const row = await c.env.DB.prepare(`SELECT owner_id FROM ${table} WHERE id = ?`).bind(id).first();
  if (!row) fail(404, 'Target not found');
  return row.owner_id as string;
}

const LINK_SELECT = `SELECT l.*, CASE l.target_type
    WHEN 'material' THEN (SELECT title FROM materials WHERE id = l.target_id)
    WHEN 'collection' THEN (SELECT title FROM collections WHERE id = l.target_id)
    ELSE 'Public page' END AS target_title
  FROM share_links l`;

r.get('/links', async (c) => {
  const user = c.get('user');
  const type = c.req.query('target_type');
  const target = c.req.query('target_id');
  const stmt =
    type && target
      ? c.env.DB.prepare(`${LINK_SELECT} WHERE l.owner_id = ? AND l.target_type = ? AND l.target_id = ? ORDER BY l.created_at DESC`).bind(user.id, type, target)
      : c.env.DB.prepare(`${LINK_SELECT} WHERE l.owner_id = ? ORDER BY l.created_at DESC LIMIT 1000`).bind(user.id);
  const { results } = await stmt.all();
  return c.json({ links: results.map(mapLink) });
});

r.post('/links', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const type = body.target_type;
  const targetId = type === 'page' ? user.id : String(body.target_id ?? '');
  const owner = await targetOwner(c, type, targetId);
  assertOwner(user, owner);

  let slug = body.slug ? String(body.slug).trim() : '';
  if (slug) {
    if (!/^[A-Za-z0-9-]{4,40}$/.test(slug)) fail(400, 'Custom link must be 4-40 letters, numbers or dashes');
    const taken = await c.env.DB.prepare(`SELECT 1 FROM share_links WHERE slug = ?`).bind(slug).first();
    if (taken) fail(409, 'That custom link is already taken');
  } else slug = newSlug();

  const id = newId();
  await c.env.DB.prepare(
    `INSERT INTO share_links (id, slug, owner_id, target_type, target_id, label, passcode_hash, expires_at, active, allow_download, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  )
    .bind(
      id,
      slug,
      owner,
      type,
      targetId,
      clampStr(body.label, 120),
      body.passcode ? await hashPasscode(String(body.passcode)) : null,
      body.expires_at ? Number(body.expires_at) : null,
      body.allow_download === undefined || body.allow_download === null ? null : body.allow_download ? 1 : 0,
      now(),
    )
    .run();
  await audit(c.env, user, 'link.create', id, { type, target: targetId });
  const row = await c.env.DB.prepare(`${LINK_SELECT} WHERE l.id = ?`).bind(id).first();
  return c.json({ link: mapLink(row!) }, 201);
});

r.patch('/links/:id', async (c) => {
  const user = c.get('user');
  const row = await c.env.DB.prepare(`SELECT * FROM share_links WHERE id = ?`).bind(c.req.param('id')).first();
  if (!row) fail(404, 'Link not found');
  assertOwner(user, row!.owner_id as string);
  const body = await c.req.json();
  const f: Record<string, unknown> = {};
  if (body.label !== undefined) f.label = clampStr(body.label, 120);
  if (body.active !== undefined) f.active = body.active ? 1 : 0;
  if (body.expires_at !== undefined) f.expires_at = body.expires_at ? Number(body.expires_at) : null;
  if (body.allow_download !== undefined) f.allow_download = body.allow_download === null ? null : body.allow_download ? 1 : 0;
  if (body.passcode !== undefined) f.passcode_hash = body.passcode ? await hashPasscode(String(body.passcode)) : null;
  const cols = Object.keys(f);
  if (cols.length) {
    await c.env.DB.prepare(`UPDATE share_links SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
      .bind(...cols.map((k) => f[k]), row!.id)
      .run();
  }
  const updated = await c.env.DB.prepare(`${LINK_SELECT} WHERE l.id = ?`).bind(row!.id).first();
  return c.json({ link: mapLink(updated!) });
});

r.delete('/links/:id', async (c) => {
  const row = await c.env.DB.prepare(`SELECT * FROM share_links WHERE id = ?`).bind(c.req.param('id')).first();
  if (!row) fail(404, 'Link not found');
  assertOwner(c.get('user'), row!.owner_id as string);
  await c.env.DB.prepare(`DELETE FROM share_links WHERE id = ?`).bind(row!.id).run();
  return c.json({ ok: true });
});

// ---------- Page design ----------

// The home page design is site-wide: only admins can edit it. Stored in settings (design_draft / design_published).
async function putSetting(c: any, key: string, value: string) {
  await c.env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(key, value).run();
}

r.get('/design', requireAdmin, async (c) => {
  const published = await c.env.DB.prepare(`SELECT value FROM settings WHERE key = 'design_published'`).first<{ value: string }>();
  const at = await c.env.DB.prepare(`SELECT value FROM settings WHERE key = 'design_published_at'`).first<{ value: string }>();
  return c.json({
    draft: await siteDesign(c.env, 'draft'),
    published: published ? await siteDesign(c.env, 'published') : null,
    published_at: at ? Number(at.value) : null,
    handle: null,
  });
});

r.put('/design', requireAdmin, async (c) => {
  const { design } = await c.req.json();
  const json = JSON.stringify(normalizeDesign(design));
  if (json.length > 300_000) fail(413, 'Design is too large');
  await putSetting(c, 'design_draft', json);
  return c.json({ ok: true, updated_at: now() });
});

r.post('/design/publish', requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const json = JSON.stringify(normalizeDesign(body?.design ?? (await siteDesign(c.env, 'draft'))));
  const t = now();
  await putSetting(c, 'design_draft', json);
  await putSetting(c, 'design_published', json);
  await putSetting(c, 'design_published_at', String(t));
  await audit(c.env, c.get('user'), 'design.publish', 'site');
  return c.json({ ok: true, published_at: t });
});

r.post('/design/revert', requireAdmin, async (c) => {
  const published = await siteDesign(c.env, 'published');
  await putSetting(c, 'design_draft', JSON.stringify(published));
  return c.json({ ok: true });
});

r.get('/page-data', async (c) => c.json(await buildSiteData(c.env)));

// ---------- Assets (images for pages and covers) ----------

r.get('/assets', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(`SELECT * FROM assets WHERE owner_id = ? ORDER BY created_at DESC LIMIT 500`).bind(user.id).all<any>();
  return c.json({ assets: results.map((a) => ({ ...a, url: assetUrl(a.id) })) });
});

r.post('/assets', async (c) => {
  const user = c.get('user');
  const type = c.req.header('Content-Type') ?? '';
  if (!/^image\/(png|jpeg|webp|gif|svg\+xml|avif)$/.test(type)) fail(415, 'Only images can be uploaded here');
  const buf = await c.req.arrayBuffer();
  if (buf.byteLength > 8 * 1024 * 1024) fail(413, 'Images must be under 8 MB');
  const used = await usedBytes(c.env, user.id);
  if (user.quota_bytes > 0 && used + buf.byteLength > user.quota_bytes) fail(413, 'Storage quota exceeded');
  const id = newId();
  await c.env.BUCKET.put(assetKey(user.id, id), buf, { httpMetadata: { contentType: type } });
  const name = clampStr(decodeURIComponent(c.req.header('X-File-Name') ?? 'image'), 200);
  await c.env.DB.prepare(`INSERT INTO assets (id, owner_id, mime, size_bytes, name, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(id, user.id, type, buf.byteLength, name, now())
    .run();
  return c.json({ asset: { id, owner_id: user.id, mime: type, size_bytes: buf.byteLength, name, created_at: now(), url: assetUrl(id) } }, 201);
});

r.delete('/assets/:id', async (c) => {
  const row = await c.env.DB.prepare(`SELECT * FROM assets WHERE id = ?`).bind(c.req.param('id')).first<any>();
  if (!row) fail(404, 'Asset not found');
  assertOwner(c.get('user'), row.owner_id);
  await c.env.BUCKET.delete(assetKey(row.owner_id, row.id));
  await c.env.DB.prepare(`DELETE FROM assets WHERE id = ?`).bind(row.id).run();
  return c.json({ ok: true });
});

// ---------- Announcements ----------

r.get('/announcements', async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT * FROM announcements WHERE owner_id = ? ORDER BY pinned DESC, created_at DESC`)
    .bind(c.get('user').id)
    .all();
  return c.json({ announcements: results.map(mapAnnouncement) });
});

r.post('/announcements', async (c) => {
  const user = c.get('user');
  const b = await c.req.json();
  const id = newId();
  await c.env.DB.prepare(`INSERT INTO announcements (id, owner_id, title, body_md, pinned, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, user.id, clampStr(b.title, 200) || 'Notice', clampStr(b.body_md, 20000), b.pinned ? 1 : 0, b.expires_at ? Number(b.expires_at) : null, now())
    .run();
  const row = await c.env.DB.prepare(`SELECT * FROM announcements WHERE id = ?`).bind(id).first();
  return c.json({ announcement: mapAnnouncement(row!) }, 201);
});

r.patch('/announcements/:id', async (c) => {
  const row = await c.env.DB.prepare(`SELECT * FROM announcements WHERE id = ?`).bind(c.req.param('id')).first<any>();
  if (!row) fail(404, 'Not found');
  assertOwner(c.get('user'), row.owner_id);
  const b = await c.req.json();
  await c.env.DB.prepare(`UPDATE announcements SET title = ?, body_md = ?, pinned = ?, expires_at = ? WHERE id = ?`)
    .bind(
      b.title !== undefined ? clampStr(b.title, 200) : row.title,
      b.body_md !== undefined ? clampStr(b.body_md, 20000) : row.body_md,
      b.pinned !== undefined ? (b.pinned ? 1 : 0) : row.pinned,
      b.expires_at !== undefined ? (b.expires_at ? Number(b.expires_at) : null) : row.expires_at,
      row.id,
    )
    .run();
  const updated = await c.env.DB.prepare(`SELECT * FROM announcements WHERE id = ?`).bind(row.id).first();
  return c.json({ announcement: mapAnnouncement(updated!) });
});

r.delete('/announcements/:id', async (c) => {
  const row = await c.env.DB.prepare(`SELECT * FROM announcements WHERE id = ?`).bind(c.req.param('id')).first<any>();
  if (!row) fail(404, 'Not found');
  assertOwner(c.get('user'), row.owner_id);
  await c.env.DB.prepare(`DELETE FROM announcements WHERE id = ?`).bind(row.id).run();
  return c.json({ ok: true });
});

export default r;
