// Short-lived signed tokens that grant read access to one material's files.
// Format: <materialId>.<expiresUnixSeconds>.<base64url HMAC-SHA256>
// Used by the API file route and by the content worker (which shares SIGNING_KEY).

const enc = new TextEncoder();
const keyCache = new Map<string, Promise<CryptoKey>>();

function getKey(secret: string): Promise<CryptoKey> {
  let k = keyCache.get(secret);
  if (!k) {
    k = crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    keyCache.set(secret, k);
  }
  return k;
}

function b64url(buf: ArrayBuffer): string {
  let s = '';
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function signToken(secret: string, materialId: string, ttlSeconds: number): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${materialId}.${exp}`;
  const sig = await crypto.subtle.sign('HMAC', await getKey(secret), enc.encode(payload));
  return `${payload}.${b64url(sig).slice(0, 32)}`;
}

export async function verifyToken(secret: string, token: string): Promise<string | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [id, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!id || !Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;
  const expected = await crypto.subtle.sign('HMAC', await getKey(secret), enc.encode(`${id}.${exp}`));
  const exp64 = b64url(expected).slice(0, 32);
  if (exp64.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ exp64.charCodeAt(i);
  return diff === 0 ? id : null;
}

/** Normalise a relative path inside a material folder, refusing traversal. */
export function safePath(p: string): string | null {
  const cleaned = p.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts: string[] = [];
  for (const seg of cleaned.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') return null;
    parts.push(seg);
  }
  return parts.length ? parts.join('/') : null;
}

export const materialPrefix = (materialId: string) => `m/${materialId}/files/`;
export const assetKey = (ownerId: string, assetId: string) => `a/${ownerId}/${assetId}`;
