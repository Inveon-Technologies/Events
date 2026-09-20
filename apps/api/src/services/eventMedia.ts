import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { Event, EventMedia } from '../models';

const execFileAsync = promisify(execFile);

// Configurable so the container's actual mount point (a persistent
// Docker volume in production — anything written to the plain
// container filesystem is lost on the next deploy) doesn't have to be
// hardcoded; defaults to something sane for local dev.
export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
export const UPLOAD_URL_PREFIX = '/api/uploads';

export const MAX_IMAGES_PER_EVENT = 5;
export const MAX_VIDEOS_PER_EVENT = 1;
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_VIDEO_DURATION_SECONDS = 20;

const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/webm']);

export class MediaValidationError extends Error {}
export class NotFoundError extends Error {}
export class ForbiddenError extends Error {}

function extensionForMimeType(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
  };
  return map[mime] || '';
}

// Trusts neither the client-declared mimetype nor a duration the
// browser might report — ffprobe reads the file's own container
// metadata directly, which is what actually determines playback length
// everywhere else too. A corrupt or non-video file makes ffprobe fail,
// which is treated as invalid rather than assumed to pass.
async function getVideoDurationSeconds(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'json',
      filePath,
    ]);
    const parsed = JSON.parse(stdout);
    const duration = parseFloat(parsed?.format?.duration);
    if (!Number.isFinite(duration)) throw new Error('Could not determine video duration');
    return duration;
  } catch {
    throw new MediaValidationError('Could not read the video file — it may be corrupt or in an unsupported format');
  }
}

export interface UploadEventMediaParams {
  organizerId: string;
  eventId: string;
  mimeType: string;
  sizeBytes: number;
  tempFilePath: string;
}

export interface EventMediaResult {
  id: string;
  mediaType: 'photo' | 'video';
  url: string;
}

export async function uploadEventMedia(params: UploadEventMediaParams): Promise<EventMediaResult> {
  const event = await Event.findByPk(params.eventId);
  if (!event) throw new NotFoundError('Event not found');
  if (event.organizerId !== params.organizerId) throw new ForbiddenError('This event does not belong to your organization');

  if (params.sizeBytes > MAX_FILE_SIZE_BYTES) {
    throw new MediaValidationError(`File is too large — the limit is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`);
  }

  const isImage = ALLOWED_IMAGE_MIME_TYPES.has(params.mimeType);
  const isVideo = ALLOWED_VIDEO_MIME_TYPES.has(params.mimeType);
  if (!isImage && !isVideo) {
    throw new MediaValidationError('Unsupported file type — images must be JPEG, PNG, or WebP, and video must be MP4 or WebM');
  }

  const mediaType: 'photo' | 'video' = isImage ? 'photo' : 'video';
  const existing = await EventMedia.findAll({ where: { eventId: params.eventId } });
  const existingImageCount = existing.filter((m) => m.mediaType === 'photo').length;
  const existingVideoCount = existing.filter((m) => m.mediaType === 'video').length;

  if (mediaType === 'photo' && existingImageCount >= MAX_IMAGES_PER_EVENT) {
    throw new MediaValidationError(`This event already has the maximum of ${MAX_IMAGES_PER_EVENT} images`);
  }
  if (mediaType === 'video' && existingVideoCount >= MAX_VIDEOS_PER_EVENT) {
    throw new MediaValidationError(`This event already has a video — remove it first to upload a different one`);
  }

  if (mediaType === 'video') {
    const duration = await getVideoDurationSeconds(params.tempFilePath);
    if (duration > MAX_VIDEO_DURATION_SECONDS) {
      throw new MediaValidationError(
        `Video is ${duration.toFixed(1)}s — the limit is ${MAX_VIDEO_DURATION_SECONDS} seconds`,
      );
    }
  }

  const eventDir = path.join(UPLOAD_DIR, 'events', params.eventId);
  await fs.mkdir(eventDir, { recursive: true });
  const filename = `${crypto.randomUUID()}${extensionForMimeType(params.mimeType)}`;
  const destPath = path.join(eventDir, filename);
  await fs.rename(params.tempFilePath, destPath);

  const url = `${UPLOAD_URL_PREFIX}/events/${params.eventId}/${filename}`;
  const media = await EventMedia.create({ eventId: params.eventId, mediaType, url });

  return { id: media.id, mediaType: media.mediaType, url: media.url };
}

export async function deleteEventMedia(organizerId: string, eventId: string, mediaId: string): Promise<void> {
  const event = await Event.findByPk(eventId);
  if (!event) throw new NotFoundError('Event not found');
  if (event.organizerId !== organizerId) throw new ForbiddenError('This event does not belong to your organization');

  const media = await EventMedia.findOne({ where: { id: mediaId, eventId } });
  if (!media) throw new NotFoundError('Media not found');

  const relativePath = media.url.replace(`${UPLOAD_URL_PREFIX}/`, '');
  const filePath = path.join(UPLOAD_DIR, relativePath);
  await fs.unlink(filePath).catch(() => {
    // File already gone from disk somehow — still remove the DB row
    // below rather than leave a dangling reference to a missing file.
  });
  await media.destroy();
}
