export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: any,
  ) {
    super(message);
  }
}

type Opts = Omit<RequestInit, 'body'> & { body?: unknown; raw?: boolean };

export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const { body, raw, headers, ...rest } = opts;
  const init: RequestInit = { credentials: 'same-origin', redirect: 'manual', ...rest, headers: { ...(headers as Record<string, string>) } };
  if (body !== undefined) {
    if (raw) init.body = body as BodyInit;
    else {
      init.body = JSON.stringify(body);
      (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
    }
  }
  const res = await fetch(path, init);
  if (res.status === 401 && path.startsWith('/api/admin')) {
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/admin/login')) {
      window.location.href = `/admin/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    }
    throw new ApiError(401, 'Please sign in');
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`, data);
  return data as T;
}

export const adminApi = <T = any>(path: string, opts?: Opts) => api<T>(`/api/admin${path}`, opts);
