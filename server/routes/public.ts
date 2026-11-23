import { Hono } from 'hono';
import type { AppEnv, Env } from '../env';
import { fail } from '../env';
import { assetUrl, getSettings, mapAnnouncement, mapCollection, mapMaterial, now, today, verifyPasscode } from '../util';
import { buildAccess, serveObject } from '../storage';
import { assetKey, materialPrefix, safePath, verifyToken } from '../tokens';
import { defaultDesign, normalizeDesign } from '../../shared/design';
import type { Material, PageDesign, PublicPageData, PublicTeacher, User } from '../../shared/types';

const r = new Hono<AppEnv>();

function publicTeacher(u: any): PublicTeacher {
  return { id: u.id, name: u.name, handle: u.handle, bio: u.bio ?? '', avatar_url: assetUrl(u.avatar_asset) };
}

/** Lightweight material shape for listings (no markdown body). */
function listMaterial(m: Material): Material {
  return { ...m, body_md: null };
}

async function teacherDesign(env: Env, ownerId: string, name: string): Promise<PageDesign> {
  const row = await env.DB.prepare(`SELECT published_json FROM page_designs WHERE owner_id = ?`).bind(ownerId).first<{ published_json: string | null }>();
  if (row?.published_json) {
    try {
      return normalizeDesign(JSON.parse(row.published_json), name);
    } catch {
      /* fall through */
    }
  }
  return defaultDesign(name || 'Classroom');
}

async function activeTeacherById(env: Env, id: string) {
  const u = await env.DB.prepare(`SELECT * FROM users WHERE id = ? AND status = 'active'`).bind(id).first<any>();
  if (!u) fail(404, 'Not found');
  return u;
}

export async function buildPageData(env: Env, user: Pick<User, 'id'> & Record<string, any>): Promise<PublicPageData> {
  const t = now();
  const [mats, cols, anns] = await Promise.all([
    env.DB.prepare(`SELECT * FROM materials WHERE owner_id = ? AND status = 'published' AND ready = 1 ORDER BY updated_at DESC LIMIT 1000`).bind(user.id).all(),
    env.DB.prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM collection_items ci JOIN materials m ON m.id = ci.material_id WHERE ci.collection_id = c.id AND m.status != 'draft') AS item_count
       FROM collections c WHERE owner_id = ? AND status = 'published' ORDER BY updated_at DESC`,
    )
      .bind(user.id)
      .all(),
    env.DB.prepare(
      `SELECT * FROM announcements WHERE owner_id = ? AND (expires_at IS NULL OR expires_at > ?) ORDER BY pinned DESC, created_at DESC LIMIT 50`,
    )
      .bind(user.id, t)
      .all(),
  ]);
  const materials = mats.results.map(mapMaterial).map(listMaterial);
  return {
    teacher: publicTeacher(user),
    materials,
    collections: cols.results.map(mapCollection),
    announcements: anns.results.map(mapAnnouncement),
    stats: {
      materials: materials.length,
      collections: cols.results.length,
      views: materials.reduce((s, m) => s + m.view_count, 0),
    },
  };
}

function countView(c: any, ownerId: string, ids: { material?: string; collection?: string; link?: string }) {
  const db: D1Database = c.env.DB;
  const stmts = [
    db.prepare(`INSERT INTO daily_views (owner_id, day, views) VALUES (?, ?, 1) ON CONFLICT(owner_id, day) DO UPDATE SET views = views + 1`).bind(ownerId, today()),
  ];
  if (ids.material) stmts.push(db.prepare(`UPDATE materials SET view_count = view_count + 1 WHERE id = ?`).bind(ids.material));
  if (ids.collection) stmts.push(db.prepare(`UPDATE collections SET view_count = view_count + 1 WHERE id = ?`).bind(ids.collection));
  if (ids.link) stmts.push(db.prepare(`UPDATE share_links SET view_count = view_count + 1 WHERE id = ?`).bind(ids.link));
  const p = db.batch(stmts).catch(() => undefined);
  try {
    c.executionCtx.waitUntil(p);
  } catch {
    /* no execution context in some test runners */
  }
}

async function collectionItems(env: Env, collectionId: string) {
  const { results } = await env.DB.prepare(
    `SELECT ci.section, ci.position, m.* FROM collection_items ci JOIN materials m ON m.id = ci.material_id
     WHERE ci.collection_id = ? AND m.status != 'draft' ORDER BY ci.position`,
  )
    .bind(collectionId)
    .all();
  return results.map((row: any) => ({ material_id: row.id, section: row.section, position: row.position, material: listMaterial(mapMaterial(row)) }));
}

// ---------- Site & teacher pages ----------

r.get('/public/site', async (c) => {
  const [settings, teachers, recent] = await Promise.all([
    getSettings(c.env),
    c.env.DB.prepare(
      `SELECT u.*, (SELECT COUNT(*) FROM materials m WHERE m.owner_id = u.id AND m.status = 'published' AND m.ready = 1) AS material_count
       FROM users u WHERE u.status = 'active' AND u.handle IS NOT NULL ORDER BY material_count DESC, u.name LIMIT 200`,
    ).all<any>(),
    c.env.DB.prepare(
      `SELECT m.*, u.name AS owner_name, u.handle AS owner_handle FROM materials m JOIN users u ON u.id = m.owner_id
       WHERE m.status = 'published' AND m.ready = 1 AND u.status = 'active' ORDER BY m.updated_at DESC LIMIT 24`,
    ).all(),
  ]);
  const homeTeacher =
    settings.homeMode === 'teacher' && settings.homeTeacherHandle
      ? ((await c.env.DB.prepare(`SELECT handle FROM users WHERE handle = ? AND status = 'active'`).bind(settings.homeTeacherHandle).first<{ handle: string }>())?.handle ?? null)
      : null;
  return c.json({
    homeTeacher,
    settings: { ...settings, logoUrl: assetUrl(settings.logoAsset) },
    teachers: teachers.results.filter((t) => t.material_count > 0 || t.role === 'teacher').map((t) => ({ ...publicTeacher(t), material_count: Number(t.material_count) })),
    recent: recent.results.map(mapMaterial).map(listMaterial),
  });
});

r.get('/public/page/:handle', async (c) => {
  const u = await c.env.DB.prepare(`SELECT * FROM users WHERE handle = ? AND status = 'active'`).bind(c.req.param('handle').toLowerCase()).first<any>();
  if (!u) fail(404, 'Teacher not found');
  const [design, data] = await Promise.all([teacherDesign(c.env, u.id, u.name), buildPageData(c.env, u)]);
  return c.json({ design, data });
});

r.get('/public/m/:id', async (c) => {
  const row = await c.env.DB.prepare(`SELECT * FROM materials WHERE id = ? AND status = 'published' AND ready = 1`).bind(c.req.param('id')).first();
  if (!row) fail(404, 'Material not found');
  const m = mapMaterial(row);
  const u = await activeTeacherById(c.env, m.owner_id);
  const origin = new URL(c.req.url).origin;
  const [design, access] = await Promise.all([teacherDesign(c.env, u.id, u.name), buildAccess(c.env, m, origin, m.allow_download)]);
  countView(c, m.owner_id, { material: m.id });
  return c.json({ material: m, access, teacher: publicTeacher(u), theme: design.theme, language: design.language });
});

r.get('/public/c/:id', async (c) => {
  const row = await c.env.DB.prepare(`SELECT * FROM collections WHERE id = ? AND status = 'published'`).bind(c.req.param('id')).first();
  if (!row) fail(404, 'Collection not found');
  const col = mapCollection(row);
  const u = await activeTeacherById(c.env, col.owner_id);
  const [design, items] = await Promise.all([teacherDesign(c.env, u.id, u.name), collectionItems(c.env, col.id)]);
  countView(c, col.owner_id, { collection: col.id });
  return c.json({ collection: col, items, teacher: publicTeacher(u), theme: design.theme, language: design.language });
});

r.get('/public/c/:id/m/:mid', async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT m.* FROM materials m JOIN collection_items ci ON ci.material_id = m.id JOIN collections c ON c.id = ci.collection_id
     WHERE c.id = ? AND c.status = 'published' AND m.id = ? AND m.status != 'draft' AND m.ready = 1`,
  )
    .bind(c.req.param('id'), c.req.param('mid'))
    .first();
  if (!row) fail(404, 'Material not found');
  const m = mapMaterial(row);
  const access = await buildAccess(c.env, m, new URL(c.req.url).origin, m.allow_download);
  countView(c, m.owner_id, { material: m.id });
  return c.json({ material: m, access });
});

// ---------- Share links ----------

async function resolveLink(c: any) {
  const link: any = await c.env.DB.prepare(`SELECT * FROM share_links WHERE slug = ?`).bind(c.req.param('slug')).first();
  if (!link || !link.active) fail(404, 'This link does not exist or was turned off.');
  if (link.expires_at && link.expires_at < now()) fail(410, 'This link has expired.');
  const owner = await activeTeacherById(c.env, link.owner_id);
  if (link.passcode_hash) {
    const code = c.req.header('X-Passcode') ?? '';
    if (!code || !(await verifyPasscode(code, link.passcode_hash))) {
      return { link, owner, locked: true as const, wrong: !!code };
    }
  }
  return { link, owner, locked: false as const, wrong: false };
}

r.get('/public/s/:slug', async (c) => {
  const { link, owner, locked, wrong } = await resolveLink(c);
  const design = await teacherDesign(c.env, owner.id, owner.name);
  const base = { teacher: publicTeacher(owner), theme: design.theme, language: design.language, label: link.label };
  if (locked) return c.json({ ...base, status: 'passcode', wrong }, wrong ? 403 : 401);

  const origin = new URL(c.req.url).origin;
  if (link.target_type === 'page') {
    countView(c, owner.id, { link: link.id });
    return c.json({ ...base, status: 'ok', type: 'page', handle: owner.handle });
  }
  if (link.target_type === 'material') {
    const row = await c.env.DB.prepare(`SELECT * FROM materials WHERE id = ? AND ready = 1`).bind(link.target_id).first();
    if (!row) fail(404, 'This material is no longer available.');
    const m = mapMaterial(row);
    const allow = link.allow_download === null ? m.allow_download : !!link.allow_download;
    const access = await buildAccess(c.env, m, origin, allow);
    countView(c, owner.id, { link: link.id, material: m.id });
    return c.json({ ...base, status: 'ok', type: 'material', material: { ...m, allow_download: allow }, access });
  }
  const colRow = await c.env.DB.prepare(`SELECT * FROM collections WHERE id = ?`).bind(link.target_id).first();
  if (!colRow) fail(404, 'This collection is no longer available.');
  const items = await collectionItems(c.env, link.target_id);
  countView(c, owner.id, { link: link.id, collection: link.target_id });
  return c.json({ ...base, status: 'ok', type: 'collection', collection: mapCollection(colRow), items });
});

r.get('/public/s/:slug/m/:mid', async (c) => {
  const { link, locked } = await resolveLink(c);
  if (locked) fail(401, 'Passcode required');
  if (link.target_type !== 'collection') fail(400, 'Not a collection link');
  const row = await c.env.DB.prepare(
    `SELECT m.* FROM materials m JOIN collection_items ci ON ci.material_id = m.id
     WHERE ci.collection_id = ? AND m.id = ? AND m.status != 'draft' AND m.ready = 1`,
  )
    .bind(link.target_id, c.req.param('mid'))
    .first();
  if (!row) fail(404, 'Material not found');
  const m = mapMaterial(row);
  const allow = link.allow_download === null ? m.allow_download : !!link.allow_download;
  const access = await buildAccess(c.env, m, new URL(c.req.url).origin, allow);
  countView(c, m.owner_id, { material: m.id });
  return c.json({ material: { ...m, allow_download: allow }, access });
});

// ---------- File streaming ----------

function pathAfter(url: string, marker: string): string | null {
  const p = new URL(url).pathname;
  const i = p.indexOf(marker);
  if (i < 0) return null;
  const rest = p.slice(i + marker.length);
  try {
    return rest.split('/').map(decodeURIComponent).join('/');
  } catch {
    return null;
  }
}

r.get('/file/:token/*', async (c) => {
  if (!c.env.SIGNING_KEY) fail(500, 'SIGNING_KEY not set');
  const token = c.req.param('token');
  const id = await verifyToken(c.env.SIGNING_KEY!, token);
  if (!id) return c.text('Link expired. Reload the page.', 403);
  const rel = safePath(pathAfter(c.req.url, `/api/file/${token}/`) ?? '');
  if (!rel) fail(400, 'Bad path');
  const dl = c.req.query('dl') === '1';
  return serveObject(c.env, materialPrefix(id) + rel, c.req.raw, {
    download: dl ? rel!.split('/').pop() : undefined,
    extraHeaders: { 'Access-Control-Allow-Origin': '*' },
  });
});

// Fallback bundle server on the main origin. The CSP sandbox gives the document an opaque origin,
// so teacher scripts cannot read this site's cookies or call its API with credentials.
r.get('/bundle/b/:token/*', async (c) => {
  if (!c.env.SIGNING_KEY) fail(500, 'SIGNING_KEY not set');
  const token = c.req.param('token');
  const id = await verifyToken(c.env.SIGNING_KEY!, token);
  if (!id) return c.text('Link expired. Reload the page.', 403);
  let rel = pathAfter(c.req.url, `/api/bundle/b/${token}/`) ?? '';
  if (!rel || rel.endsWith('/')) rel += 'index.html';
  const path = safePath(rel);
  if (!path) fail(400, 'Bad path');
  return serveObject(c.env, materialPrefix(id) + path, c.req.raw, {
    extraHeaders: {
      'Content-Security-Policy': 'sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads',
      'Access-Control-Allow-Origin': '*',
    },
  });
});

r.get('/assets/:id', async (c) => {
  const row = await c.env.DB.prepare(`SELECT owner_id FROM assets WHERE id = ?`).bind(c.req.param('id')).first<{ owner_id: string }>();
  if (!row) return c.text('Not found', 404);
  return serveObject(c.env, assetKey(row.owner_id, c.req.param('id')), c.req.raw, {
    cacheControl: 'public, max-age=31536000, immutable',
  });
});

export default r;
