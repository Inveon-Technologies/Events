import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { moveFile } from './fileMove';
import { isS3Configured, uploadFileToS3, s3KeyFromUrl } from './s3Storage';
import { sniffImageMimeType, UPLOAD_DIR, UPLOAD_URL_PREFIX, MAX_FILE_SIZE_BYTES } from './eventMedia';
import { logger } from '../logger';

// Images an organizer uploads for ticket design — the title background
// and partner / sponsor logos. Stored like event media (S3 when
// configured, otherwise UPLOAD_DIR) under organizers/<id>/design/, and
// referenced by URL from the event (see Event.ticketBackgroundUrl,
// Event.partners).

export class DesignAssetValidationError extends Error {}

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function extensionFor(mime: string): string {
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  return '.jpg';
}

export async function storeDesignImage(params: {
  organizerId: string;
  mimeType: string;
  sizeBytes: number;
  tempFilePath: string;
}): Promise<{ url: string }> {
  try {
    if (params.sizeBytes > MAX_FILE_SIZE_BYTES) {
      throw new DesignAssetValidationError(`File is too large — the limit is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`);
    }
    if (!ALLOWED_MIME_TYPES.has(params.mimeType)) {
      throw new DesignAssetValidationError('Unsupported file type — use a JPEG, PNG, or WebP image');
    }
    const mimeType = await sniffImageMimeType(params.tempFilePath);
    if (!mimeType) throw new DesignAssetValidationError('This file is not a valid JPEG, PNG, or WebP image');

    const filename = `${crypto.randomUUID()}${extensionFor(mimeType)}`;
    if (isS3Configured()) {
      const url = await uploadFileToS3(params.tempFilePath, `organizers/${params.organizerId}/design/${filename}`, mimeType);
      await fs.unlink(params.tempFilePath).catch(() => undefined);
      return { url };
    }
    const dir = path.join(UPLOAD_DIR, 'organizers', params.organizerId, 'design');
    await fs.mkdir(dir, { recursive: true });
    await moveFile(params.tempFilePath, path.join(dir, filename));
    return { url: `${UPLOAD_URL_PREFIX}/organizers/${params.organizerId}/design/${filename}` };
  } catch (err) {
    await fs.unlink(params.tempFilePath).catch(() => undefined);
    throw err;
  }
}

// An image URL an organizer may put on an event: one of this platform's
// own uploads (/api/uploads/…) or any https URL. Anything else (http,
// javascript:, data:, relative paths elsewhere) is rejected.
export function isAcceptableImageUrl(url: string): boolean {
  if (url.length > 2048) return false;
  if (url.startsWith(`${UPLOAD_URL_PREFIX}/`)) return !url.includes('..') && !/[?#\\]/.test(url);
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

// The absolute file path for one of our own local uploads, or null.
// Guards against a URL escaping UPLOAD_DIR.
export function localUploadPath(url: string): string | null {
  if (!url.startsWith(`${UPLOAD_URL_PREFIX}/`)) return null;
  const relative = url.slice(UPLOAD_URL_PREFIX.length + 1).split(/[?#]/)[0];
  const root = path.resolve(UPLOAD_DIR);
  const full = path.resolve(root, relative);
  return full.startsWith(`${root}${path.sep}`) ? full : null;
}

// The bytes of an image referenced by an event (banner, ticket
// background, partner logo) for server-side rendering — ticket card,
// PDF, invoice. Best-effort: null when it can't be loaded quickly.
export async function loadStoredImage(url: string | null | undefined, maxBytes = 8 * 1024 * 1024): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const local = localUploadPath(url);
    if (local) {
      const buf = await fs.readFile(local);
      return buf.length <= maxBytes ? buf : null;
    }
    if (!/^https:\/\//.test(url)) return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(s3KeyFromUrl(url) ? 8000 : 5000), redirect: 'error' });
    if (!res.ok) return null;
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > maxBytes) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length <= maxBytes ? buf : null;
  } catch (err) {
    logger.warn({ err, url }, 'Could not load an event image');
    return null;
  }
}

// Absolute URL for an image, for places outside the web app (emails,
// WhatsApp) where a relative /api/uploads/… path means nothing.
export function absoluteImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//.test(url)) return url;
  const base = (process.env.WEB_PUBLIC_URL || process.env.API_PUBLIC_URL || '').replace(/\/+$/, '');
  return base ? `${base}${url}` : null;
}
