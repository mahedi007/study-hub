import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { decodeJwt } from 'jose';
import type { AppEnv, Env } from '../env';
import { fail } from '../env';
import {
  checkLock,
  clearFailures,
  clearSession,
  findAuthToken,
  hashPassword,
  issueSession,
  randomToken,
  recordFailure,
  superAdminEmail,
  validatePassword,
  verifyPassword,
} from '../auth';
import { audit, clampStr, getSettings, mapUser, newId, normEmail, now, uniqueHandle, validEmail } from '../util';

const r = new Hono<AppEnv>();

async function createUser(env: Env, opts: { email: string; name: string; role: 'admin' | 'teacher'; status: 'active' | 'pending'; passwordHash?: string | null; googleSub?: string | null }) {
  const settings = await getSettings(env);
  const id = newId();
  const handle = await uniqueHandle(env, opts.name || opts.email.split('@')[0]);
  await env.DB.prepare(
    `INSERT INTO users (id, email, name, handle, role, status, quota_bytes, password_hash, google_sub, created_at, last_login_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, opts.email, opts.name || opts.email.split('@')[0], handle, opts.role, opts.status, Math.round(settings.defaultQuotaMb * 1048576), opts.passwordHash ?? null, opts.googleSub ?? null, now(), opts.status === 'active' ? now() : null)
    .run();
  return mapUser((await env.DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(id).first())!);
}

const PENDING_MSG = 'আপনার অ্যাকাউন্ট অনুমোদনের অপেক্ষায় আছে। অ্যাডমিন অনুমোদন দিলে লগইন করতে পারবেন। (Your account is waiting for admin approval.)';
const DISABLED_MSG = 'এই অ্যাকাউন্টটি বন্ধ করা আছে। (This account is disabled.)';

r.get('/config', async (c) => {
  const settings = await getSettings(c.env);
  return c.json({
    google: !!(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET),
    registration: settings.registration,
    siteName: settings.siteName,
    setupCode: !!c.env.SETUP_CODE,
  });
});

r.post('/login', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  // The sign-in box takes an email or a username.
  const email = normEmail(b.email);
  const password = String(b.password ?? '');
  const byUsername = !!email && !email.includes('@');
  if (!email || (!byUsername && !validEmail(email)) || !password) fail(400, 'ইমেইল/ইউজারনেম ও পাসওয়ার্ড দিন (Enter your email or username and password).');
  await checkLock(c.env, email);
  const row = await c.env.DB.prepare(byUsername ? `SELECT * FROM users WHERE handle = ?` : `SELECT * FROM users WHERE email = ?`).bind(email).first<any>();
  if (!row || !(await verifyPassword(c.env, password, row.password_hash))) {
    await recordFailure(c.env, email);
    if (row && !row.password_hash && row.google_sub) fail(401, 'এই অ্যাকাউন্টে Google দিয়ে লগইন করুন (This account uses Google sign-in).');
    if (row && !row.password_hash) fail(401, 'এখনো পাসওয়ার্ড সেট করা হয়নি — ইনভাইট লিংক ব্যবহার করুন (No password yet — use your invite link).');
    fail(401, 'ইমেইল/ইউজারনেম বা পাসওয়ার্ড ভুল (Wrong email/username or password).');
  }
  if (row.status === 'pending') fail(403, PENDING_MSG);
  if (row.status === 'disabled') fail(403, DISABLED_MSG);
  await clearFailures(c.env, email);
  await issueSession(c, row);
  return c.json({ ok: true });
});

r.post('/register', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const email = normEmail(b.email);
  const name = clampStr(b.name, 120).trim();
  if (!validEmail(email)) fail(400, 'সঠিক ইমেইল দিন (Enter a valid email).');
  if (!name) fail(400, 'নাম দিন (Enter your name).');
  const password = validatePassword(b.password);
  const existing = await c.env.DB.prepare(`SELECT * FROM users WHERE email = ?`).bind(email).first<any>();
  if (existing) {
    if (existing.password_hash) fail(409, 'এই ইমেইলে আগেই অ্যাকাউন্ট আছে — লগইন করুন (Account exists — sign in).');
    fail(409, 'এই ইমেইলটি ইনভাইট করা হয়েছে — ইনভাইট লিংক বা Google দিয়ে ঢুকুন (This email was invited — use your invite link or Google).');
  }

  if (email === superAdminEmail(c.env)) {
    // Nobody can claim the super admin email with a password unless they know SETUP_CODE.
    if (!c.env.SETUP_CODE) fail(403, 'সুপার অ্যাডমিন Google দিয়ে লগইন করবেন (Super admin: sign in with Google, or set SETUP_CODE).');
    if (String(b.setupCode ?? '') !== c.env.SETUP_CODE) return c.json({ error: 'সেটআপ কোড দিন (Enter the setup code).', needSetupCode: true }, 403);
    const user = await createUser(c.env, { email, name, role: 'admin', status: 'active', passwordHash: await hashPassword(c.env, password) });
    await audit(c.env, user, 'auth.super_admin_created', user.id);
    await issueSession(c, { id: user.id, session_version: 1 });
    return c.json({ ok: true });
  }

  const settings = await getSettings(c.env);
  if (settings.registration === 'closed') fail(403, 'নতুন অ্যাকাউন্ট খোলা বন্ধ — অ্যাডমিনের কাছে ইনভাইট চান (Sign-up is closed — ask the admin for an invite).');
  const status = settings.registration === 'open' ? 'active' : 'pending';
  const user = await createUser(c.env, { email, name, role: 'teacher', status, passwordHash: await hashPassword(c.env, password) });
  await audit(c.env, user, status === 'active' ? 'auth.register' : 'auth.register_pending', user.id);
  if (status === 'pending') return c.json({ ok: true, pending: true, message: PENDING_MSG });
  await issueSession(c, { id: user.id, session_version: 1 });
  return c.json({ ok: true });
});

r.post('/logout', (c) => {
  clearSession(c);
  return c.json({ ok: true });
});

// ---------- Invite / reset links ----------

r.get('/token/:token', async (c) => {
  const found = await findAuthToken(c.env, c.req.param('token'));
  if (!found) fail(404, 'লিংকটি মেয়াদোত্তীর্ণ বা ভুল (This link is invalid or expired).');
  return c.json({ kind: found!.kind, email: found!.user.email, name: found!.user.name });
});

r.post('/token/:token', async (c) => {
  const found = await findAuthToken(c.env, c.req.param('token'));
  if (!found) fail(404, 'লিংকটি মেয়াদোত্তীর্ণ বা ভুল (This link is invalid or expired).');
  const b = await c.req.json().catch(() => ({}));
  const password = validatePassword(b.password);
  const u = found!.user;
  if (u.status === 'disabled') fail(403, DISABLED_MSG);
  const name = clampStr(b.name, 120).trim() || u.name;
  const version = Number(u.session_version) + 1;
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE users SET password_hash = ?, name = ?, status = 'active', session_version = ? WHERE id = ?`).bind(
      await hashPassword(c.env, password),
      name,
      version,
      u.id,
    ),
    c.env.DB.prepare(`DELETE FROM auth_tokens WHERE user_id = ?`).bind(u.id),
  ]);
  await clearFailures(c.env, u.email);
  await audit(c.env, mapUser(u), found!.kind === 'invite' ? 'auth.invite_accepted' : 'auth.password_reset', u.id);
  await issueSession(c, { id: u.id, session_version: version });
  return c.json({ ok: true });
});

// ---------- Google sign-in (OAuth 2.0 authorization code flow) ----------

const OAUTH_COOKIE = 'sh_oauth';

r.get('/google/start', (c) => {
  if (!c.env.GOOGLE_CLIENT_ID) return c.redirect('/admin/login?error=google_off');
  const origin = new URL(c.req.url).origin;
  const state = randomToken(18);
  setCookie(c, OAUTH_COOKIE, state, { httpOnly: true, secure: origin.startsWith('https'), sameSite: 'Lax', path: '/api/auth', maxAge: 600 });
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${origin}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

r.get('/google/callback', async (c) => {
  const origin = new URL(c.req.url).origin;
  const back = (code: string) => c.redirect(`/admin/login?error=${code}`);
  const state = c.req.query('state');
  const code = c.req.query('code');
  const cookieState = getCookie(c, OAUTH_COOKIE);
  deleteCookie(c, OAUTH_COOKIE, { path: '/api/auth' });
  if (c.req.query('error')) return back('google_cancelled');
  if (!code || !state || !cookieState || state !== cookieState) return back('google_state');
  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) return back('google_off');

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${origin}/api/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  });
  const tok = (await tokenRes.json().catch(() => ({}))) as { id_token?: string };
  if (!tokenRes.ok || !tok.id_token) return back('google_failed');
  // The ID token came straight from Google's token endpoint over TLS, authenticated with our client
  // secret, so (per OpenID Connect) we validate its claims rather than re-verifying the signature.
  const claims = decodeJwt(tok.id_token) as { aud?: string; iss?: string; email?: string; email_verified?: boolean; sub?: string; name?: string; exp?: number };
  if (claims.aud !== c.env.GOOGLE_CLIENT_ID || !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss ?? '') || !claims.sub) return back('google_failed');
  if (!claims.email || !claims.email_verified) return back('google_unverified');
  if ((claims.exp ?? 0) < Date.now() / 1000) return back('google_failed');
  const email = claims.email.toLowerCase();

  let row = await c.env.DB.prepare(`SELECT * FROM users WHERE google_sub = ? OR email = ? ORDER BY google_sub IS NULL LIMIT 1`).bind(claims.sub, email).first<any>();
  if (row) {
    if (row.status === 'disabled') return back('disabled');
    if (!row.google_sub) await c.env.DB.prepare(`UPDATE users SET google_sub = ? WHERE id = ?`).bind(claims.sub, row.id).run();
    if (row.status === 'pending') return back('pending');
    // Invited users without a password become active the first time they prove their email with Google.
    await c.env.DB.prepare(`DELETE FROM auth_tokens WHERE user_id = ? AND kind = 'invite'`).bind(row.id).run();
  } else {
    const isSuper = email === superAdminEmail(c.env);
    const settings = await getSettings(c.env);
    if (!isSuper && settings.registration === 'closed') return back('not_invited');
    const status = isSuper || settings.registration === 'open' ? 'active' : 'pending';
    const user = await createUser(c.env, { email, name: claims.name ?? '', role: isSuper ? 'admin' : 'teacher', status, googleSub: claims.sub });
    await audit(c.env, user, isSuper ? 'auth.super_admin_created' : status === 'active' ? 'auth.register' : 'auth.register_pending', user.id, { via: 'google' });
    if (status === 'pending') return back('pending');
    row = await c.env.DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(user.id).first<any>();
  }
  await issueSession(c, row);
  return c.redirect('/admin');
});

export default r;
