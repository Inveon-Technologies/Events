// Client for the super admin API at /api/sa/<secret path>/… The secret
// path segment comes from the page URL (/x/<secret>) and is never stored
// in the app bundle. The session lives in sessionStorage, so closing the
// tab signs the admin out.

export class SaError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export interface SaSession {
  token: string;
  email: string;
  name: string;
  expiresAt: number;
}

const SESSION_KEY = 'inveon_sa_session';

export function getSaSession(): SaSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const s = raw ? (JSON.parse(raw) as SaSession) : null;
    if (!s || !s.token || s.expiresAt < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

export function saveSaSession(session: SaSession): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Storage blocked — the session still works until reload.
  }
}

export function clearSaSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing to clear.
  }
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

export function saBase(key: string): string {
  return `/api/sa/${encodeURIComponent(key)}`;
}

export async function saRequest<T>(
  key: string,
  path: string,
  options: { method?: string; body?: unknown; form?: FormData; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  const session = getSaSession();
  if (options.auth !== false && session) headers.Authorization = `Bearer ${session.token}`;
  let body: BodyInit | undefined;
  if (options.form) body = options.form;
  else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  const res = await fetch(`${saBase(key)}${path}`, { method: options.method ?? (body ? 'POST' : 'GET'), headers, body });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const message = (data as { error?: string } | null)?.error || `Request failed (${res.status})`;
    if (res.status === 401 && options.auth !== false) {
      clearSaSession();
      onUnauthorized?.();
    }
    throw new SaError(message, res.status);
  }
  return data as T;
}

// Fetches a file with the session and saves it in the browser.
export async function saDownload(key: string, path: string, filename: string): Promise<void> {
  const session = getSaSession();
  const res = await fetch(`${saBase(key)}${path}`, { headers: session ? { Authorization: `Bearer ${session.token}` } : {} });
  if (!res.ok) {
    let message = `Download failed (${res.status})`;
    try {
      message = ((await res.json()) as { error?: string }).error ?? message;
    } catch {
      // not JSON
    }
    throw new SaError(message, res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
