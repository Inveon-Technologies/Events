// No base URL by default — same-origin, relative requests. This is what
// production needs: nginx serves the web build and proxies /api/* to the
// api container on the same origin, so there's nothing to configure and
// no CORS to worry about. Local dev, where the Vite dev server (5173) and
// the API (3000) are different origins, sets VITE_API_BASE_URL explicitly
// in apps/web/.env (see .env.example) to override this.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export class ApiError extends Error {
  status: number;
  // The full parsed response body, when the server sent one — lets a
  // caller read a field beyond just the top-level error message (e.g.
  // ticketCheckIn.ts's reasonCode on a 409, used to distinguish a
  // cancelled ticket from an already-checked-in one). Optional and
  // additive: every existing caller that only reads .message/.status
  // is unaffected.
  body?: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

// Fired when an authenticated request comes back 401 — the organizer's
// 12-hour token expired (or was otherwise rejected). AuthContext listens
// and logs the user out, so they land on the login page instead of
// every page silently failing to load.
export const SESSION_EXPIRED_EVENT = 'inveon:session-expired';

function notifyIfSessionExpired(status: number, token: string | null | undefined) {
  if (status === 401 && token && typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
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
    notifyIfSessionExpired(res.status, options.token);
    throw new ApiError(res.status, (data as { error?: string }).error ?? 'Something went wrong', data);
  }

  return data as T;
}

// Separate from apiRequest — a file upload is multipart/form-data, not
// JSON, so it can't share that function's Content-Type header or body
// serialization (the browser sets the correct multipart boundary itself
// when given a FormData body and no explicit Content-Type).
export interface UploadedEventMedia {
  id: string;
  mediaType: 'photo' | 'video';
  url: string;
}

export async function uploadEventMediaFile(
  eventId: string,
  file: File,
  token: string | null,
): Promise<UploadedEventMedia> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE_URL}/api/organizer/events/${eventId}/media`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    notifyIfSessionExpired(res.status, token);
    throw new ApiError(res.status, (data as { error?: string }).error ?? 'Upload failed', data);
  }

  return data as UploadedEventMedia;
}

export async function deleteEventMediaFile(eventId: string, mediaId: string, token: string | null): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/organizer/events/${eventId}/media/${mediaId}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (data as { error?: string }).error ?? 'Could not remove this file', data);
  }
}

export async function uploadOrganizerLogoFile(file: File, token: string | null): Promise<{ logoUrl: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE_URL}/api/organizer/profile/logo`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    notifyIfSessionExpired(res.status, token);
    throw new ApiError(res.status, (data as { error?: string }).error ?? 'Upload failed', data);
  }

  return data as { logoUrl: string };
}
