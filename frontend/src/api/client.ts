// Access token lives in memory only. The long-lived refresh token is an HttpOnly cookie
// the browser sends to /api/auth/refresh, which is how the session survives closing the app.

export class ApiError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message || code);
  }
}

const BASE = '/api';
let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onSessionLost: (() => void) | null = null;

export function setSessionLostHandler(fn: () => void) {
  onSessionLost = fn;
}
export function setAccessToken(t: string | null) {
  accessToken = t;
}

async function raw(method: string, path: string, body?: unknown, retry = true): Promise<Response> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network_error');
  }
  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await refreshSession()) return raw(method, path, body, false);
    onSessionLost?.();
  }
  return res;
}

async function parse<T>(res: Response): Promise<T> {
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* empty or non-JSON body */
  }
  if (!res.ok) throw new ApiError(res.status, data?.error || 'server_error', data?.message);
  return data as T;
}

/** Single-flight refresh so parallel requests don't rotate the cookie twice. */
export function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(BASE + '/auth/refresh', { method: 'POST', credentials: 'include' });
        if (!res.ok) {
          accessToken = null;
          return false;
        }
        accessToken = (await res.json()).access_token;
        return true;
      } catch {
        return false;
      } finally {
        setTimeout(() => (refreshing = null), 0);
      }
    })();
  }
  return refreshing;
}

export const api = {
  get: <T>(p: string) => raw('GET', p).then((r) => parse<T>(r)),
  post: <T>(p: string, b?: unknown) => raw('POST', p, b ?? {}).then((r) => parse<T>(r)),
  patch: <T>(p: string, b: unknown) => raw('PATCH', p, b).then((r) => parse<T>(r)),
  del: <T>(p: string) => raw('DELETE', p).then((r) => parse<T>(r)),
};
