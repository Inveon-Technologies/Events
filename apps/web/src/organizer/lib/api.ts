// No base URL by default — same-origin, relative requests. This is what
// production needs: nginx serves the web build and proxies /api/* to the
// api container on the same origin, so there's nothing to configure and
// no CORS to worry about. Local dev, where the Vite dev server (5173) and
// the API (3000) are different origins, sets VITE_API_BASE_URL explicitly
// in apps/web/.env (see .env.example) to override this.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string | null } = {},
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}/api${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(res.status, (data as { error?: string }).error ?? 'Something went wrong');
  }

  return data as T;
}
