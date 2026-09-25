import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { Op } from 'sequelize';
import { sequelize } from '../db/connection';
import { moveFile } from './fileMove';
import { Event, EventMedia } from '../models';
import { isS3Configured, uploadFileToS3, deleteFileFromS3, s3KeyFromUrl } from './s3Storage';

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

// The browser-declared mimetype is just a claim — it's whatever the
// client sent. Images are checked against their real file signature
// (video already gets the same treatment via ffprobe above), so a file
// that isn't actually a JPEG/PNG/WebP can never be stored and served
// back from this platform's origin as if it were one.
export async function sniffImageMimeType(filePath: string): Promise<string | null> {
  const handle = await fs.open(filePath, 'r');
  try {
    const header = Buffer.alloc(12);
    const { bytesRead } = await handle.read(header, 0, 12, 0);
    if (bytesRead >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return 'image/jpeg';
    if (bytesRead >= 8 && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      return 'image/png';
    }
    if (bytesRead >= 12 && header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP') {
      return 'image/webp';
    }
    return null;
  } finally {
    await handle.close();
  }
}

// The image to show for an event wherever it appears as a card: its
// explicit banner if one was set, otherwise its first uploaded photo
// (the create/edit flow uploads photos as event media and never sets a
// separate banner — the first photo IS the cover). One query for any
// number of events. Events with neither map to null.
export async function getEventCoverUrls(events: Array<{ id: string; bannerUrl: string | null }>): Promise<Map<string, string | null>> {
  const covers = new Map<string, string | null>(events.map((e) => [e.id, e.bannerUrl]));
  const needPhoto = events.filter((e) => !e.bannerUrl).map((e) => e.id);
  if (needPhoto.length === 0) return covers;

  const photos = await EventMedia.findAll({
    where: { eventId: needPhoto, mediaType: 'photo' },
    order: [['createdAt', 'ASC']],
  });
  for (const photo of photos) {
    if (!covers.get(photo.eventId)) covers.set(photo.eventId, photo.url);
  }
  return covers;
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
  try {
    return await storeEventMedia(params);
  } finally {
    // Every exit path — validation failure included — leaves nothing
    // behind in the temp dir. After a successful store the file has
    // already been moved/deleted and this is a harmless no-op.
    await fs.unlink(params.tempFilePath).catch(() => undefined);
  }
}

function countFor(mediaType: 'photo' | 'video', media: EventMedia[]): number {
  return media.filter((m) => m.mediaType === mediaType).length;
}

function assertUnderLimit(mediaType: 'photo' | 'video', existing: EventMedia[]): void {
  if (mediaType === 'photo' && countFor('photo', existing) >= MAX_IMAGES_PER_EVENT) {
    throw new MediaValidationError(`This event already has the maximum of ${MAX_IMAGES_PER_EVENT} images`);
  }
  if (mediaType === 'video' && countFor('video', existing) >= MAX_VIDEOS_PER_EVENT) {
    throw new MediaValidationError(`This event already has a video — remove it first to upload a different one`);
  }
}

// A file may be on S3 or on local disk (uploaded before S3 was set up),
// so both are tried.
async function removeStoredFile(url: string): Promise<void> {
  const s3Key = s3KeyFromUrl(url);
  if (s3Key) await deleteFileFromS3(s3Key).catch(() => undefined);
  if (url.startsWith(`${UPLOAD_URL_PREFIX}/`) && !url.includes('..')) {
    await fs.unlink(path.join(UPLOAD_DIR, url.replace(`${UPLOAD_URL_PREFIX}/`, ''))).catch(() => undefined);
  }
}

async function storeEventMedia(params: UploadEventMediaParams): Promise<EventMediaResult> {
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

  // For images, the real type (from the file's own bytes) is what gets
  // stored and served — never the client's claim.
  let mimeType = params.mimeType;
  if (isImage) {
    const sniffed = await sniffImageMimeType(params.tempFilePath);
    if (!sniffed) {
      throw new MediaValidationError('This file is not a valid JPEG, PNG, or WebP image');
    }
    mimeType = sniffed;
  }

  const mediaType: 'photo' | 'video' = isImage ? 'photo' : 'video';
  const existing = await EventMedia.findAll({ where: { eventId: params.eventId } });

  // Early, cheap rejection before any file is stored; re-checked under
  // a lock below, which is what actually enforces the limit.
  assertUnderLimit(mediaType, existing);

  if (mediaType === 'video') {
    const duration = await getVideoDurationSeconds(params.tempFilePath);
    if (duration > MAX_VIDEO_DURATION_SECONDS) {
      throw new MediaValidationError(
        `Video is ${duration.toFixed(1)}s — the limit is ${MAX_VIDEO_DURATION_SECONDS} seconds`,
      );
    }
  }

  const filename = `${crypto.randomUUID()}${extensionForMimeType(mimeType)}`;
  let url: string;

  if (isS3Configured()) {
    // Persistent, CDN-friendly storage that survives every deploy
    // without needing a mounted volume — the object key mirrors the
    // same events/{eventId}/{filename} layout the local-disk path
    // below uses, so the two storage backends stay easy to reason
    // about side by side.
    const key = `events/${params.eventId}/${filename}`;
    url = await uploadFileToS3(params.tempFilePath, key, mimeType);
    await fs.unlink(params.tempFilePath).catch(() => {
      // Uploaded successfully — a leftover temp file is just disk
      // clutter, not a reason to fail the request.
    });
  } else {
    const eventDir = path.join(UPLOAD_DIR, 'events', params.eventId);
    await fs.mkdir(eventDir, { recursive: true });
    const destPath = path.join(eventDir, filename);
    await moveFile(params.tempFilePath, destPath);
    url = `${UPLOAD_URL_PREFIX}/events/${params.eventId}/${filename}`;
  }

  // Concurrent uploads each passed the early check above against the
  // same count, so the limit is enforced again here while holding the
  // event row's lock — uploads to one event serialize on it, and only
  // those that still fit get a row. A loser's stored file is removed.
  try {
    const media = await sequelize.transaction(async (t) => {
      await Event.findByPk(params.eventId, { transaction: t, lock: t.LOCK.UPDATE });
      const current = await EventMedia.findAll({ where: { eventId: params.eventId }, transaction: t });
      assertUnderLimit(mediaType, current);
      return EventMedia.create({ eventId: params.eventId, mediaType, url }, { transaction: t });
    });
    return { id: media.id, mediaType: media.mediaType, url: media.url };
  } catch (err) {
    await removeStoredFile(url);
    throw err;
  }
}

// Duplicating an event's media copies the database rows only, never
// the underlying files — the same photo/video content is still valid
// for the new event, so there's no reason to download and re-upload
// identical bytes to a new S3 key or disk path. Each new row still
// gets its own id, so deleting one event's media never touches the
// other's.
export async function duplicateEventMedia(sourceEventId: string, targetEventId: string, organizerId: string): Promise<EventMediaResult[]> {
  const [sourceEvent, targetEvent] = await Promise.all([Event.findByPk(sourceEventId), Event.findByPk(targetEventId)]);
  if (!sourceEvent || !targetEvent) throw new NotFoundError('Event not found');
  if (sourceEvent.organizerId !== organizerId || targetEvent.organizerId !== organizerId) {
    throw new ForbiddenError('These events do not belong to your organization');
  }

  const sourceMedia = await EventMedia.findAll({ where: { eventId: sourceEventId }, order: [['createdAt', 'ASC']] });
  const created = await Promise.all(
    sourceMedia.map((m) => EventMedia.create({ eventId: targetEventId, mediaType: m.mediaType, url: m.url })),
  );

  return created.map((m) => ({ id: m.id, mediaType: m.mediaType, url: m.url }));
}

export async function deleteEventMedia(organizerId: string, eventId: string, mediaId: string): Promise<void> {
  const event = await Event.findByPk(eventId);
  if (!event) throw new NotFoundError('Event not found');
  if (event.organizerId !== organizerId) throw new ForbiddenError('This event does not belong to your organization');

  const media = await EventMedia.findOne({ where: { id: mediaId, eventId } });
  if (!media) throw new NotFoundError('Media not found');

  // Duplicated events share their source's files (duplicateEventMedia
  // copies rows, not bytes), so the file is only removed once no other
  // media row — on this event or any other — still points at it.
  // Deleting a photo from a duplicate used to delete it from the
  // original event too.
  const otherReferences = await EventMedia.count({ where: { url: media.url, id: { [Op.ne]: media.id } } });
  if (otherReferences === 0) {
    await removeStoredFile(media.url);
  }
  await media.destroy();
}
