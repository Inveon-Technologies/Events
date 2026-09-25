import crypto from 'crypto';
import path from 'path';
import fsp from 'fs/promises';
import { isS3Configured, uploadFileToS3 } from './s3Storage';
import { sniffImageMimeType, UPLOAD_DIR, UPLOAD_URL_PREFIX } from './eventMedia';

export class PlatformImageError extends Error {}

const EXT: Record<string, string> = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };

// Logo and other platform images set in the super admin portal. Same
// storage as every other upload: S3 when configured, else the uploads
// folder — linked as /api/uploads/platform/<file>.
export async function storePlatformImage(tempFilePath: string): Promise<string> {
  const mime = await sniffImageMimeType(tempFilePath);
  if (!mime || !EXT[mime]) throw new PlatformImageError('Use a PNG, JPEG or WebP image');
  const filename = `${crypto.randomUUID()}${EXT[mime]}`;
  if (isS3Configured()) {
    return uploadFileToS3(tempFilePath, `platform/${filename}`, mime);
  }
  const dir = path.join(UPLOAD_DIR, 'platform');
  await fsp.mkdir(dir, { recursive: true });
  await fsp.copyFile(tempFilePath, path.join(dir, filename));
  return `${UPLOAD_URL_PREFIX}/platform/${filename}`;
}
