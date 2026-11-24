import { Hono } from 'hono';
import type { AppEnv, Env } from '../env';
import { fail } from '../env';
import { assetUrl, getSettings, mapAnnouncement, mapCollection, mapMaterial, now, today, verifyPasscode } from '../util';
import { buildAccess, serveObject } from '../storage';
import { assetKey, materialPrefix, safePath, verifyToken } from '../tokens';
import { superAdminEmail } from '../auth';
import { defaultDesign, normalizeDesign } from '../../shared/design';
import type { Material, PageDesign, PublicPageData, PublicTeacher, SiteInfo } from '../../shared/types';

const r = new Hono<AppEnv>();

function publicTeacher(u: any): PublicTeacher {
  return { id: u.id, name: u.name, handle: u.handle, bio: u.bio ?? '', avatar_url: assetUrl(u.avatar_asset) };
}

/** Lightweight material shape for listings (no markdown body). */
function listMaterial(m: Material): Material {
  return { ...m, body_md: null };
}

const MATERIAL_WITH_OWNER = `SELECT m.*, u.name AS owner_name, u.handle AS owner_handle FROM materials m JOIN users u ON u.id = m.owner_id`;

// ---------- Site design (one home page for the whole site) ----------

async function readDesign(env: Env, key: 'design_published' | 'design_draft'): Promise<PageDesign | null> {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?`).bind(key).first<{ value: string }>();
  if (row?.value) {
    try {
      return normalizeDesign(JSON.parse(row.value));
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Earlier versions stored one design per teacher; reuse the super admin's as the starting point. */
async function legacyDesign(env: Env): Promise<PageDesign | null> {
  const row = await env.DB.prepare(
    `SELECT p.published_json, p.draft_json FROM page_designs p JOIN users u ON u.id = p.owner_id
     ORDER BY (u.email = ?) DESC, (u.role = 'admin') DESC, p.published_at DESC LIMIT 1`,
  )
    .bind(superAdminEmail(env))
    .first<{ published_json: string | null; draft_json: string }>();
  const raw = row?.published_json ?? row?.draft_json;
  if (!raw) return null;
  try {
    return normalizeDesign(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function siteDesign(env: Env, which: 'published' | 'draft' = 'published'): Promise<PageDesign> {
  if (which === 'draft') {
    const draft = await readDesign(env, 'design_draft');
    if (draft) return draft;
  }
  return (await readDesign(env, 'design_published')) ?? (await legacyDesign(env)) ?? defaultDesign();
}

export async function siteInfo(env: Env): Promise<SiteInfo> {
  const s = await getSettings(env);
  return { siteName: s.siteName, brandName: s.brandName, logoUrl: assetUrl(s.logoAsset) };
}

export async function buildSiteData(env: Env): Promise<PublicPageData> {
  const t = now();
  // The super admin runs the system and is not a teacher: their own uploads, collections
  // and profile never appear on the site (assign a material to a teacher to publish it).
  const sa = superAdminEmail(env);
  const [mats, cols, anns, teachers, site] = await Promise.all([
    env.DB.prepare(`${MATERIAL_WITH_OWNER} WHERE m.status = 'published' AND m.ready = 1 AND u.status = 'active' AND u.email != ? ORDER BY m.created_at DESC LIMIT 3000`).bind(sa).all(),
    env.DB.prepare(
      `SELECT c.*, u.name AS owner_name, u.handle AS owner_handle,
         (SELECT COUNT(*) FROM collection_items ci JOIN materials m ON m.id = ci.material_id WHERE ci.collection_id = c.id AND m.status != 'draft') AS item_count
       FROM collections c JOIN users u ON u.id = c.owner_id WHERE c.status = 'published' AND u.status = 'active' AND u.email != ? ORDER BY c.updated_at DESC`,
    ).bind(sa).all<any>(),
    env.DB.prepare(
      `SELECT a.*, CASE WHEN u.email = ? THEN '' ELSE u.name END AS owner_name FROM announcements a JOIN users u ON u.id = a.owner_id
       WHERE u.status = 'active' AND (a.expires_at IS NULL OR a.expires_at > ?) ORDER BY a.pinned DESC, a.created_at DESC LIMIT 50`,
    )
      .bind(sa, t)
      .all<any>(),
    env.DB.prepare(
      `SELECT u.*, (SELECT COUNT(*) FROM materials m WHERE m.owner_id = u.id AND m.status = 'published' AND m.ready = 1) AS material_count
       FROM users u WHERE u.status = 'active' AND u.handle IS NOT NULL AND u.email != ? ORDER BY material_count DESC, u.name`,
    ).bind(sa).all<any>(),
    siteInfo(env),
  ]);
  const materials = mats.results.map(mapMaterial).map(listMaterial);
  const teacherList = teachers.results.filter((u) => Number(u.material_count) > 0).map((u) => ({ ...publicTeacher(u), material_count: Number(u.material_count) }));
  return {
    site,
    teachers: teacherList,
    materials,
    collections: cols.results.map((c) => ({ ...mapCollection(c), owner_name: c.owner_name, owner_handle: c.owner_handle })),
    announcements: anns.results.map((a) => ({ ...mapAnnouncement(a), owner_name: a.owner_name })),
    stats: {
      materials: materials.length,
      collections: cols.results.length,
      views: materials.reduce((s, m) => s + m.view_count, 0),
      teachers: teacherList.length,
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

async function pageContext(env: Env) {
  const [design, site] = await Promise.all([siteDesign(env), siteInfo(env)]);
  return { theme: design.theme, language: design.language, site };
}

// ---------- Home ----------

/** One home-page visit per browser session (the app calls this once), for the admin dashboard. */
r.post('/public/visit', async (c) => {
  const p = c.env.DB.prepare(`INSERT INTO daily_views (owner_id, day, views) VALUES ('_site', ?, 1) ON CONFLICT(owner_id, day) DO UPDATE SET views = views + 1`)
    .bind(today())
    .run()
    .catch(() => undefined);
  try {
    c.executionCtx.waitUntil(p);
  } catch {
    await p;
  }
  return c.json({ ok: true });
});

r.get('/public/home', async (c) => {
  const [design, data] = await Promise.all([siteDesign(c.env), buildSiteData(c.env)]);
  return c.json({ design, data });
});

/** Old `/t/<teacher>/m/<id>` links: tell the app where the material lives now. */
r.get('/public/m/:id', async (c) => {
  const row = await c.env.DB.prepare(`SELECT slug FROM materials WHERE id = ? AND status != 'draft'`).bind(c.req.param('id')).first<{ slug: string }>();
  if (!row) fail(404, 'Material not found');
  return c.json({ slug: row!.slug });
});

r.get('/public/topic/:slug', async (c) => {
  const row = await c.env.DB.prepare(`${MATERIAL_WITH_OWNER} WHERE m.slug = ? AND m.status != 'draft' AND m.ready = 1 AND u.status = 'active'`)
    .bind(c.req.param('slug').toLowerCase())
    .first();
  if (!row) fail(404, 'Material not found');
  const m = mapMaterial(row);
  const owner = await c.env.DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(m.owner_id).first<any>();
  const [ctx, access] = await Promise.all([pageContext(c.env), buildAccess(c.env, m, new URL(c.req.url).origin, m.allow_download)]);
  countView(c, m.owner_id, { material: m.id });
  return c.json({ material: m, access, teacher: publicTeacher(owner), ...ctx });
});

r.get('/public/c/:id', async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT c.* FROM collections c JOIN users u ON u.id = c.owner_id WHERE c.id = ? AND c.status = 'published' AND u.status = 'active'`,
  )
    .bind(c.req.param('id'))
    .first();
  if (!row) fail(404, 'Collection not found');
  const col = mapCollection(row);
  const owner = await c.env.DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(col.owner_id).first<any>();
  const [ctx, items] = await Promise.all([pageContext(c.env), collectionItems(c.env, col.id)]);
  countView(c, col.owner_id, { collection: col.id });
  return c.json({ collection: col, items, teacher: publicTeacher(owner), ...ctx });
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
  const owner: any = await c.env.DB.prepare(`SELECT * FROM users WHERE id = ? AND status = 'active'`).bind(link.owner_id).first();
  if (!owner) fail(404, 'Not found');
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
  const ctx = await pageContext(c.env);
  const base = { teacher: publicTeacher(owner), ...ctx, label: link.label };
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

/** Private (signed, expiring) copy of an HTML lesson — used for drafts opened through share links. Served untouched. */
r.get('/bundle/b/:token/*', async (c) => {
  if (!c.env.SIGNING_KEY) fail(500, 'SIGNING_KEY not set');
  const token = c.req.param('token');
  const id = await verifyToken(c.env.SIGNING_KEY!, token);
  if (!id) return c.text('Link expired. Reload the page.', 403);
  let rel = pathAfter(c.req.url, `/api/bundle/b/${token}/`) ?? '';
  if (!rel || rel.endsWith('/')) rel += 'index.html';
  const path = safePath(rel);
  if (!path) fail(400, 'Bad path');
  return serveObject(c.env, materialPrefix(id) + path, c.req.raw, { cacheControl: 'private, max-age=300' });
});

r.get('/assets/:id', async (c) => {
  const row = await c.env.DB.prepare(`SELECT owner_id FROM assets WHERE id = ?`).bind(c.req.param('id')).first<{ owner_id: string }>();
  if (!row) return c.text('Not found', 404);
  return serveObject(c.env, assetKey(row.owner_id, c.req.param('id')), c.req.raw, {
    cacheControl: 'public, max-age=31536000, immutable',
  });
});

export default r;
