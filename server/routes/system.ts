import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { fail } from '../env';
import { createAuthToken, hashPassword, requireAdmin, superAdminEmail, validatePassword } from '../auth';
import { NO_EMAIL_DOMAIN, assetUrl, audit, clampStr, getSettings, mapUser, newId, normEmail, now, slugifyHandle, uniqueHandle as uniqueHandleEnv, validEmail } from '../util';
import { deletePrefix } from '../storage';
import { DEFAULT_SETTINGS } from '../../shared/design';

const FREE_R2_BYTES = 10 * 1024 * 1024 * 1024;

const r = new Hono<AppEnv>();
r.use('*', requireAdmin);

const USER_SELECT = `SELECT u.*,
  (SELECT COALESCE(SUM(size_bytes),0) FROM materials WHERE owner_id = u.id) + (SELECT COALESCE(SUM(size_bytes),0) FROM assets WHERE owner_id = u.id) AS used_bytes,
  (SELECT COUNT(*) FROM materials WHERE owner_id = u.id) AS material_count
  FROM users u`;

r.get('/users', async (c) => {
  const { results } = await c.env.DB.prepare(`${USER_SELECT} ORDER BY u.status = 'pending' DESC, u.created_at DESC`).all();
  return c.json({ superAdminEmail: superAdminEmail(c.env), users: results.map((u: any) => ({ ...mapUser(u), avatar_url: assetUrl(u.avatar_asset) })) });
});

const uniqueHandle = (c: any, base: string, excludeId?: string) => uniqueHandleEnv(c.env, base, excludeId);

/** A username the admin typed must be free — never silently renamed. */
async function claimUsername(c: any, raw: unknown, excludeId?: string): Promise<string> {
  const handle = slugifyHandle(String(raw ?? ''));
  if (handle.length < 3) fail(400, 'Username needs at least 3 letters or numbers (a-z, 0-9, -).');
  const row = await c.env.DB.prepare(`SELECT id FROM users WHERE handle = ?`).bind(handle).first();
  if (row && row.id !== excludeId) fail(409, `The username “${handle}” is already taken.`);
  return handle;
}

async function claimEmail(c: any, raw: unknown, excludeId?: string): Promise<string> {
  const email = normEmail(raw);
  if (!validEmail(email)) fail(400, 'Enter a valid email');
  const row = await c.env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(email).first();
  if (row && row.id !== excludeId) fail(409, 'A user with this email already exists');
  return email;
}

/**
 * Create a teacher. Two ways:
 *  - with a password: the admin sets username + password and hands them over (no email needed);
 *  - without one: an invite link is returned so the teacher picks their own password.
 */
r.post('/users', async (c) => {
  const actor = c.get('user');
  const b = await c.req.json();
  const settings = await getSettings(c.env);
  const id = newId();
  const password = b.password ? validatePassword(b.password) : null;
  const handle = b.handle ? await claimUsername(c, b.handle) : await uniqueHandle(c, b.name || String(b.email ?? '').split('@')[0]);
  let email: string;
  if (String(b.email ?? '').trim()) email = await claimEmail(c, b.email);
  else if (password) email = `${handle}-${id.slice(0, 6)}@${NO_EMAIL_DOMAIN}`;
  else fail(400, 'Give an email (for an invite link) or set a password.');
  const quotaMb = b.quota_mb === undefined || b.quota_mb === '' ? settings.defaultQuotaMb : Math.max(0, Number(b.quota_mb) || 0);
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, name, handle, role, status, quota_bytes, password_hash, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
  )
    .bind(
      id,
      email!,
      clampStr(b.name, 120) || handle,
      handle,
      b.role === 'admin' ? 'admin' : 'teacher',
      Math.round(quotaMb * 1048576),
      password ? await hashPassword(c.env, password) : null,
      now(),
    )
    .run();
  await audit(c.env, actor, password ? 'user.create' : 'user.invite', id, { handle, role: b.role });
  const row = await c.env.DB.prepare(`${USER_SELECT} WHERE u.id = ?`).bind(id).first();
  if (password) return c.json({ user: mapUser(row!), link: null }, 201);
  const token = await createAuthToken(c.env, id, 'invite', 14);
  return c.json({ user: mapUser(row!), link: `${new URL(c.req.url).origin}/admin/invite/${token}` }, 201);
});

r.patch('/users/:id', async (c) => {
  const actor = c.get('user');
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(id).first();
  if (!row) fail(404, 'User not found');
  const b = await c.req.json();
  if (id === actor.id && (b.role === 'teacher' || b.status === 'disabled')) fail(400, 'You cannot demote or disable yourself');
  if (row!.email === superAdminEmail(c.env) && (b.role === 'teacher' || b.status === 'disabled')) fail(400, 'The super admin cannot be demoted or disabled');
  const f: Record<string, unknown> = {};
  if (b.name !== undefined) f.name = clampStr(b.name, 120);
  if (b.bio !== undefined) f.bio = clampStr(b.bio, 2000);
  if (b.avatar_asset !== undefined) {
    const asset = b.avatar_asset ? String(b.avatar_asset) : null;
    if (asset && !(await c.env.DB.prepare(`SELECT id FROM assets WHERE id = ?`).bind(asset).first())) fail(400, 'That photo no longer exists');
    f.avatar_asset = asset;
  }
  if (b.role !== undefined && ['admin', 'teacher'].includes(b.role)) f.role = b.role;
  if (b.status !== undefined && ['active', 'disabled'].includes(b.status)) f.status = b.status;
  if (b.quota_mb !== undefined) f.quota_bytes = Math.round(Math.max(0, Number(b.quota_mb) || 0) * 1048576);
  if (b.handle !== undefined && b.handle !== row!.handle) f.handle = await claimUsername(c, b.handle, id);
  if (b.email !== undefined && normEmail(b.email) !== row!.email) {
    if (row!.email === superAdminEmail(c.env)) fail(400, 'The super admin email is set in Cloudflare (SUPER_ADMIN_EMAIL), not here.');
    if (!String(b.email).trim()) {
      if (!row!.password_hash) fail(400, 'Set a password before removing the email, or they cannot sign in.');
      f.email = `${f.handle ?? row!.handle}-${id.slice(0, 6)}@${NO_EMAIL_DOMAIN}`;
    } else {
      f.email = await claimEmail(c, b.email, id);
    }
  }
  let passwordChanged = false;
  if (b.password) {
    f.password_hash = await hashPassword(c.env, validatePassword(b.password));
    passwordChanged = true;
  }
  const cols = Object.keys(f);
  if (cols.length) {
    await c.env.DB.prepare(`UPDATE users SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).bind(...cols.map((k) => f[k]), id).run();
  }
  // Disabling a user signs them out everywhere.
  // A new password also signs them out of their other devices.
  if (f.status === 'disabled' || passwordChanged) {
    await c.env.DB.prepare(`UPDATE users SET session_version = session_version + 1 WHERE id = ?`).bind(id).run();
  }
  const { password_hash: _ph, ...logged } = f;
  await audit(c.env, actor, passwordChanged ? 'user.password_set' : 'user.update', id, logged);
  const updated = await c.env.DB.prepare(`${USER_SELECT} WHERE u.id = ?`).bind(id).first();
  return c.json({ user: mapUser(updated!) });
});

/** A one-time link the admin can send (e.g. on WhatsApp) so a teacher can set or reset their password. */
r.post('/users/:id/link', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(id).first<any>();
  if (!row) fail(404, 'User not found');
  const kind = row.password_hash ? 'reset' : 'invite';
  const token = await createAuthToken(c.env, id, kind, kind === 'reset' ? 2 : 14);
  await audit(c.env, c.get('user'), `user.${kind}_link`, id);
  return c.json({ kind, link: `${new URL(c.req.url).origin}/admin/invite/${token}` });
});

r.delete('/users/:id', async (c) => {
  const actor = c.get('user');
  const id = c.req.param('id');
  if (id === actor.id) fail(400, 'You cannot delete yourself');
  const target = await c.env.DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(id).first();
  if (!target) fail(404, 'User not found');
  if (target!.email === superAdminEmail(c.env)) fail(400, 'The super admin cannot be removed');
  const transferTo = c.req.query('transferTo');
  const purge = c.req.query('purge') === '1';
  if (!transferTo && !purge) fail(400, 'Choose to transfer their content to another user or delete it.');

  if (transferTo) {
    const to = await c.env.DB.prepare(`SELECT id FROM users WHERE id = ?`).bind(transferTo).first();
    if (!to || transferTo === id) fail(400, 'Invalid transfer target');
    const { results: movedAssets } = await c.env.DB.prepare(`SELECT id FROM assets WHERE owner_id = ?`).bind(id).all<{ id: string }>();
    await c.env.DB.batch(
      ['materials', 'collections', 'share_links', 'assets', 'announcements'].map((t) =>
        c.env.DB.prepare(`UPDATE ${t} SET owner_id = ? WHERE owner_id = ?`).bind(transferTo, id),
      ),
    );
    // Asset keys include the owner id, so move the image objects to the new owner's prefix.
    for (const a of movedAssets) {
      const obj = await c.env.BUCKET.get(`a/${id}/${a.id}`);
      if (obj) {
        await c.env.BUCKET.put(`a/${transferTo}/${a.id}`, await obj.arrayBuffer(), { httpMetadata: obj.httpMetadata });
        await c.env.BUCKET.delete(`a/${id}/${a.id}`);
      }
    }
  } else {
    const { results } = await c.env.DB.prepare(`SELECT id FROM materials WHERE owner_id = ?`).bind(id).all<{ id: string }>();
    for (const m of results) await deletePrefix(c.env, `m/${m.id}/`);
    await deletePrefix(c.env, `a/${id}/`);
    await c.env.DB.batch([
      c.env.DB.prepare(`DELETE FROM collection_items WHERE collection_id IN (SELECT id FROM collections WHERE owner_id = ?)`).bind(id),
      c.env.DB.prepare(`DELETE FROM collection_items WHERE material_id IN (SELECT id FROM materials WHERE owner_id = ?)`).bind(id),
      ...['share_links', 'collections', 'materials', 'assets', 'announcements'].map((t) => c.env.DB.prepare(`DELETE FROM ${t} WHERE owner_id = ?`).bind(id)),
    ]);
  }
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM page_designs WHERE owner_id = ?`).bind(id),
    c.env.DB.prepare(`DELETE FROM daily_views WHERE owner_id = ?`).bind(id),
    c.env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(id),
  ]);
  await audit(c.env, actor, 'user.delete', id, { email: target!.email, transferTo, purge });
  return c.json({ ok: true });
});

r.get('/settings', async (c) => c.json({ settings: await getSettings(c.env) }));

r.put('/settings', async (c) => {
  const b = await c.req.json();
  const current = await getSettings(c.env);
  const next = { ...current };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof typeof DEFAULT_SETTINGS)[]) {
    if (b[key] === undefined) continue;
    const def = DEFAULT_SETTINGS[key];
    if (typeof def === 'number') (next as any)[key] = Math.max(0, Number(b[key]) || 0);
    else if (key === 'logoAsset') next.logoAsset = b[key] || null;
    else (next as any)[key] = clampStr(b[key], 500);
  }
  if (!['bn', 'en'].includes(next.defaultLanguage)) next.defaultLanguage = 'bn';
  if (!['directory', 'teacher'].includes(next.homeMode)) next.homeMode = 'directory';
  if (!['closed', 'approval', 'open'].includes(next.registration)) next.registration = 'approval';
  await c.env.DB.prepare(`INSERT INTO settings (key, value) VALUES ('site', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .bind(JSON.stringify(next))
    .run();
  await audit(c.env, c.get('user'), 'settings.update');
  return c.json({ settings: next });
});

r.get('/audit', async (c) => {
  const limit = Math.min(500, Number(c.req.query('limit') ?? 200));
  const { results } = await c.env.DB.prepare(`SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?`).bind(limit).all();
  return c.json({ entries: results });
});

r.get('/storage', async (c) => {
  const [byKind, byUser, assets, totals] = await Promise.all([
    c.env.DB.prepare(`SELECT kind, COUNT(*) AS n, COALESCE(SUM(size_bytes),0) AS bytes FROM materials GROUP BY kind ORDER BY bytes DESC`).all(),
    c.env.DB.prepare(`${USER_SELECT} ORDER BY used_bytes DESC`).all(),
    c.env.DB.prepare(`SELECT COALESCE(SUM(size_bytes),0) AS bytes, COUNT(*) AS n FROM assets`).first<{ bytes: number; n: number }>(),
    c.env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM materials) AS materials, (SELECT COUNT(*) FROM collections) AS collections,
              (SELECT COUNT(*) FROM share_links) AS links, (SELECT COUNT(*) FROM users) AS users,
              (SELECT COALESCE(SUM(view_count),0) FROM materials) AS views`,
    ).first(),
  ]);
  const materialBytes = (byKind.results as any[]).reduce((s, k) => s + Number(k.bytes), 0);
  return c.json({
    limit: FREE_R2_BYTES,
    used: materialBytes + Number(assets?.bytes ?? 0),
    byKind: byKind.results,
    assets,
    byUser: byUser.results.map(mapUser),
    totals,
  });
});

export default r;
