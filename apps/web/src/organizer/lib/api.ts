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

export interface UploadProgress {
  loaded: number;
  total: number;
}

// fetch() can't report upload progress, so file uploads that show a
// progress bar go through XMLHttpRequest instead.
export function uploadWithProgress<T>(
  path: string,
  formData: FormData,
  token: string | null,
  onProgress?: (p: UploadProgress) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}/api${path}`);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.({ loaded: e.loaded, total: e.total });
    };
    xhr.onload = () => {
      let data: unknown = {};
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : {};
      } catch {
        data = {};
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data as T);
        return;
      }
      notifyIfSessionExpired(xhr.status, token);
      const fallback = xhr.status === 413 ? 'This file is too large for the server' : 'Upload failed';
      reject(new ApiError(xhr.status, (data as { error?: string }).error ?? fallback, data));
    };
    xhr.onerror = () => reject(new ApiError(0, 'Network error — check your connection and try again'));
    xhr.ontimeout = () => reject(new ApiError(0, 'The upload timed out — try again'));
    xhr.send(formData);
  });
}

export async function uploadEventMediaFile(
  eventId: string,
  file: File,
  token: string | null,
  onProgress?: (p: UploadProgress) => void,
): Promise<UploadedEventMedia> {
  const formData = new FormData();
  formData.append('file', file);
  return uploadWithProgress<UploadedEventMedia>(`/organizer/events/${eventId}/media`, formData, token, onProgress);
}

// Ticket-design image (title background or partner logo). Uploaded
// straight away — it isn't tied to an event — and the returned URL is
// saved on the event with the rest of the form.
export async function uploadDesignImage(file: File, token: string | null): Promise<{ url: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE_URL}/api/organizer/uploads/image`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    notifyIfSessionExpired(res.status, token);
    throw new ApiError(res.status, (data as { error?: string }).error ?? 'Upload failed', data);
  }
  return data as { url: string };
}

// Server-rendered certificate preview (the same renderer attendees'
// PDFs use), for a design that may not be saved yet. Returns an object URL.
export async function fetchCertificatePreview(eventId: string, design: unknown, participant: string, token: string | null): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/api/organizer/events/${eventId}/certificate/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ design, participant }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    notifyIfSessionExpired(res.status, token);
    throw new ApiError(res.status, (data as { error?: string }).error ?? 'Preview failed', data);
  }
  return URL.createObjectURL(await res.blob());
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
