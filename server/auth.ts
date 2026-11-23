import { createMiddleware } from 'hono/factory';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Context } from 'hono';
import type { AppEnv, Env } from './env';
import { HttpError } from './env';
import { mapUser, now, toHex } from './util';
import type { User } from '../shared/types';

export const SESSION_COOKIE = 'sh_session';
const SESSION_DAYS = 30;
const enc = new TextEncoder();

export const superAdminEmail = (env: Env) => (env.SUPER_ADMIN_EMAIL || 'mahedi.pro@gmail.com').trim().toLowerCase();

function authSecret(env: Env): string {
  const s = env.AUTH_SECRET || env.SIGNING_KEY;
  if (!s) throw new HttpError(500, 'AUTH_SECRET is not set. Add it as a secret (see README).');
  return s;
}

const keyCache = new Map<string, Promise<CryptoKey>>();
function hmacKey(secret: string) {
  let k = keyCache.get(secret);
  if (!k) {
    k = crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    keyCache.set(secret, k);
  }
  return k;
}

async function hmac(secret: string, data: string): Promise<ArrayBuffer> {
  return crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(data));
}

function b64url(buf: ArrayBuffer): string {
  let s = '';
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function randomToken(bytes = 24): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)).buffer);
}

export async function sha256Hex(s: string) {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

// ---------- Passwords ----------
// PBKDF2-SHA256 with a per-user salt, plus a server-side pepper (HMAC with AUTH_SECRET) so a leaked
// database alone cannot be brute-forced. Iterations are kept modest to fit the 10 ms CPU budget of the
// Workers free plan; raise PASSWORD_ITERATIONS if you move to the paid plan. Old hashes keep working.

const DEFAULT_ITERATIONS = 20000;

async function pbkdf2(env: Env, password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const peppered = await hmac(authSecret(env), `pw:${password}`);
  const key = await crypto.subtle.importKey('raw', peppered, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return toHex(bits);
}

export async function hashPassword(env: Env, password: string): Promise<string> {
  const iterations = Math.min(100000, Math.max(5000, Number(env.PASSWORD_ITERATIONS) || DEFAULT_ITERATIONS));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${iterations}$${toHex(salt.buffer)}$${await pbkdf2(env, password, salt, iterations)}`;
}

export async function verifyPassword(env: Env, password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [scheme, it, saltHex, hash] = stored.split('$');
  if (scheme !== 'pbkdf2' || !saltHex || !hash) return false;
  const salt = new Uint8Array(saltHex.match(/../g)!.map((h) => parseInt(h, 16)));
  return safeEqual(await pbkdf2(env, password, salt, Number(it)), hash);
}

export function validatePassword(pw: unknown): string {
  const p = typeof pw === 'string' ? pw : '';
  if (p.length < 8) throw new HttpError(400, 'পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে (Password must be at least 8 characters).');
  if (p.length > 200) throw new HttpError(400, 'Password is too long');
  return p;
}

// ---------- Sessions (stateless signed cookie: userId.version.expiry.signature) ----------

export async function issueSession(c: Context<AppEnv>, user: Pick<User, 'id'> & { session_version?: number }) {
  const version = Number((user as any).session_version ?? 1);
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  const payload = `${user.id}.${version}.${exp}`;
  const sig = b64url(await hmac(authSecret(c.env), `sess:${payload}`));
  setCookie(c, SESSION_COOKIE, `${payload}.${sig}`, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_DAYS * 86400,
  });
}

export function clearSession(c: Context<AppEnv>) {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

async function readSession(c: Context<AppEnv>): Promise<{ id: string; version: number; exp: number } | null> {
  const raw = getCookie(c, SESSION_COOKIE);
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length !== 4) return null;
  const [id, ver, exp, sig] = parts;
  if (Number(exp) < Date.now() / 1000) return null;
  const expected = b64url(await hmac(authSecret(c.env), `sess:${id}.${ver}.${exp}`));
  if (!safeEqual(sig, expected)) return null;
  return { id, version: Number(ver), exp: Number(exp) };
}

export async function currentUser(c: Context<AppEnv>): Promise<User | null> {
  const s = await readSession(c);
  if (!s) return null;
  const row = await c.env.DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(s.id).first<any>();
  if (!row || Number(row.session_version) !== s.version || row.status !== 'active') return null;
  const user = mapUser(row);
  // Super admin email always keeps admin rights.
  if (user.email === superAdminEmail(c.env) && user.role !== 'admin') {
    await c.env.DB.prepare(`UPDATE users SET role = 'admin' WHERE id = ?`).bind(user.id).run();
    user.role = 'admin';
  }
  // Refresh the cookie when it is past half its life, and record activity at most every 10 minutes.
  if (s.exp - Date.now() / 1000 < (SESSION_DAYS * 86400) / 2) await issueSession(c, row);
  if (!user.last_login_at || now() - user.last_login_at > 10 * 60 * 1000) {
    await c.env.DB.prepare(`UPDATE users SET last_login_at = ? WHERE id = ?`).bind(now(), user.id).run();
  }
  return user;
}

/** Block cross-site form/fetch posts: state-changing requests must come from this site. */
export const sameOrigin = createMiddleware<AppEnv>(async (c, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const origin = c.req.header('Origin');
    if (origin && new URL(origin).host !== new URL(c.req.url).host) throw new HttpError(403, 'Cross-site request blocked');
  }
  await next();
});

export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const user = await currentUser(c);
  if (!user) throw new HttpError(401, 'Please sign in');
  c.set('user', user);
  await next();
});

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get('user')?.role !== 'admin') throw new HttpError(403, 'Admins only');
  await next();
});

export function assertOwner(user: User, ownerId: string) {
  if (user.role !== 'admin' && user.id !== ownerId) throw new HttpError(404, 'Not found');
}

// ---------- Login throttling ----------

export async function checkLock(env: Env, email: string) {
  const row = await env.DB.prepare(`SELECT locked_until FROM login_attempts WHERE email = ?`).bind(email).first<{ locked_until: number | null }>();
  if (row?.locked_until && row.locked_until > now()) {
    const mins = Math.ceil((row.locked_until - now()) / 60000);
    throw new HttpError(429, `অনেকবার ভুল পাসওয়ার্ড — ${mins} মিনিট পর আবার চেষ্টা করুন (Too many attempts, try again in ${mins} min).`);
  }
}

export async function recordFailure(env: Env, email: string) {
  const row = await env.DB.prepare(`SELECT failures FROM login_attempts WHERE email = ?`).bind(email).first<{ failures: number }>();
  const failures = (row?.failures ?? 0) + 1;
  const locked = failures >= 8 ? now() + 15 * 60 * 1000 : null;
  await env.DB.prepare(
    `INSERT INTO login_attempts (email, failures, locked_until, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET failures = excluded.failures, locked_until = excluded.locked_until, updated_at = excluded.updated_at`,
  )
    .bind(email, locked ? 0 : failures, locked, now())
    .run();
}

export async function clearFailures(env: Env, email: string) {
  await env.DB.prepare(`DELETE FROM login_attempts WHERE email = ?`).bind(email).run();
}

// ---------- One-time invite / reset links ----------

export async function createAuthToken(env: Env, userId: string, kind: 'invite' | 'reset', days = 7): Promise<string> {
  const token = randomToken(24);
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM auth_tokens WHERE user_id = ? AND kind = ?`).bind(userId, kind),
    env.DB.prepare(`INSERT INTO auth_tokens (token_hash, user_id, kind, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`).bind(
      await sha256Hex(token),
      userId,
      kind,
      now() + days * 86400000,
      now(),
    ),
  ]);
  return token;
}

export async function findAuthToken(env: Env, token: string) {
  const row = await env.DB.prepare(
    `SELECT t.kind, t.expires_at, u.* FROM auth_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?`,
  )
    .bind(await sha256Hex(token))
    .first<any>();
  if (!row || row.expires_at < now()) return null;
  return { kind: row.kind as 'invite' | 'reset', user: row };
}
