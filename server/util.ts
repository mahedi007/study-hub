import { customAlphabet } from 'nanoid';
import type { Announcement, Collection, Material, ShareLink, SiteSettings, User } from '../shared/types';
import { DEFAULT_SETTINGS, slugify } from '../shared/design';
import type { Env } from './env';

const alpha = '0123456789abcdefghijkmnopqrstuvwxyz';
export const newId = customAlphabet(alpha, 14);
export const newSlug = customAlphabet('23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ', 10);

export const now = () => Date.now();
export const today = () => new Date().toISOString().slice(0, 10);

export function slugifyHandle(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

const enc = new TextEncoder();

export function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Passcodes for share links are short, low-value secrets: salted SHA-256 is enough and stays under the 10 ms CPU budget. */
export async function hashPasscode(code: string, salt = toHex(crypto.getRandomValues(new Uint8Array(8)).buffer)): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(`${salt}:${code.trim()}`));
  return `${salt}$${toHex(digest)}`;
}

export async function verifyPasscode(code: string, stored: string): Promise<boolean> {
  const [salt] = stored.split('$');
  if (!salt) return false;
  return (await hashPasscode(code, salt)) === stored;
}

export function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw !== 'string') return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

type Row = Record<string, any>;

export function mapUser(r: Row): User {
  return {
    id: r.id,
    email: r.email,
    name: r.name ?? '',
    handle: r.handle ?? null,
    role: r.role,
    status: r.status,
    quota_bytes: Number(r.quota_bytes ?? 0),
    has_password: !!r.password_hash,
    google_linked: !!r.google_sub,
    bio: r.bio ?? '',
    avatar_asset: r.avatar_asset ?? null,
    created_at: Number(r.created_at),
    last_login_at: r.last_login_at ? Number(r.last_login_at) : null,
    used_bytes: r.used_bytes !== undefined ? Number(r.used_bytes ?? 0) : undefined,
    material_count: r.material_count !== undefined ? Number(r.material_count ?? 0) : undefined,
  };
}

export function mapMaterial(r: Row): Material {
  return {
    id: r.id,
    owner_id: r.owner_id,
    title: r.title,
    description: r.description ?? '',
    kind: r.kind,
    slug: r.slug ?? r.id,
    icon: r.icon ?? '',
    audio_file: r.audio_file ?? null,
    file_name: r.file_name ?? null,
    entry_path: r.entry_path ?? null,
    mime: r.mime ?? null,
    size_bytes: Number(r.size_bytes ?? 0),
    file_count: Number(r.file_count ?? 0),
    embed_url: r.embed_url ?? null,
    body_md: r.body_md ?? null,
    subject: r.subject ?? '',
    class_level: r.class_level ?? '',
    tags: parseTags(r.tags),
    cover_asset: r.cover_asset ?? null,
    status: r.status,
    allow_download: !!r.allow_download,
    view_count: Number(r.view_count ?? 0),
    ready: !!r.ready,
    created_at: Number(r.created_at),
    updated_at: Number(r.updated_at),
    owner_name: r.owner_name,
    owner_email: r.owner_email,
    owner_handle: r.owner_handle,
  };
}

export function mapCollection(r: Row): Collection {
  return {
    id: r.id,
    owner_id: r.owner_id,
    title: r.title,
    description: r.description ?? '',
    cover_asset: r.cover_asset ?? null,
    status: r.status,
    view_count: Number(r.view_count ?? 0),
    created_at: Number(r.created_at),
    updated_at: Number(r.updated_at),
    item_count: r.item_count !== undefined ? Number(r.item_count) : undefined,
  };
}

export function mapLink(r: Row): ShareLink {
  return {
    id: r.id,
    slug: r.slug,
    owner_id: r.owner_id,
    target_type: r.target_type,
    target_id: r.target_id,
    label: r.label ?? '',
    has_passcode: !!r.passcode_hash,
    expires_at: r.expires_at ? Number(r.expires_at) : null,
    active: !!r.active,
    allow_download: r.allow_download === null || r.allow_download === undefined ? null : !!r.allow_download,
    view_count: Number(r.view_count ?? 0),
    created_at: Number(r.created_at),
    target_title: r.target_title,
  };
}

export function mapAnnouncement(r: Row): Announcement {
  return {
    id: r.id,
    owner_id: r.owner_id,
    title: r.title,
    body_md: r.body_md ?? '',
    pinned: !!r.pinned,
    expires_at: r.expires_at ? Number(r.expires_at) : null,
    created_at: Number(r.created_at),
  };
}

export async function getSettings(env: Env): Promise<SiteSettings> {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'site'`).first<{ value: string }>();
  let stored: Partial<SiteSettings> = {};
  if (row?.value) {
    try {
      stored = JSON.parse(row.value);
    } catch {
      /* ignore */
    }
  }
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function audit(env: Env, actor: User | null, action: string, target?: string, meta?: unknown) {
  try {
    await env.DB.prepare(
      `INSERT INTO audit_log (actor_id, actor_email, action, target, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(actor?.id ?? null, actor?.email ?? null, action, target ?? null, meta === undefined ? null : JSON.stringify(meta), now())
      .run();
  } catch {
    /* audit must never break the request */
  }
}

export function assetUrl(id: string | null | undefined): string | null {
  return id ? `/api/assets/${id}` : null;
}

export function clampStr(v: unknown, max: number): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

export async function uniqueHandle(env: Env, base: string, excludeId?: string): Promise<string> {
  let handle = slugifyHandle(base) || 'teacher';
  if (handle.length < 3) handle = `${handle}-teacher`;
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? handle : `${handle}-${i + 1}`;
    const row = await env.DB.prepare(`SELECT id FROM users WHERE handle = ?`).bind(candidate).first<{ id: string }>();
    if (!row || row.id === excludeId) return candidate;
  }
  return `${handle}-${newId().slice(0, 4)}`;
}

/** Teachers created with only a username get a placeholder address on this domain (never emailed). */
export const NO_EMAIL_DOMAIN = 'no-email.local';

export const normEmail = (v: unknown) => String(v ?? '').trim().toLowerCase();
export const validEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

/** A topic slug that no other material uses (adds -2, -3, … when needed). */
export async function uniqueSlug(env: Env, base: string, excludeId?: string): Promise<string> {
  const root = slugify(base);
  for (let i = 1; i < 60; i++) {
    const candidate = i === 1 ? root : `${root.slice(0, 74)}-${i}`;
    const row = await env.DB.prepare(`SELECT id FROM materials WHERE slug = ?`).bind(candidate).first<{ id: string }>();
    if (!row || row.id === excludeId) return candidate;
  }
  return `${root.slice(0, 60)}-${newId().slice(0, 6)}`;
}
