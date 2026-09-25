import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';

// No ACL is set on upload, deliberately — buckets created since April
// 2023 default to "Bucket owner enforced" (ACLs disabled entirely), and
// PutObjectCommand with ACL: 'public-read' against one of those fails
// outright. Public read access has to come from a bucket policy
// instead, which is an AWS-console-side step outside what this code (or
// this environment, which has no network path to AWS's API either) can
// configure — see the setup note this module's consumers surface when
// S3 isn't reachable.

// Every stored image is linked as /api/uploads/<key> and served by the
// API (app.ts): from local disk, or streamed from S3. The bucket never
// has to be public — earlier, links pointed at the bucket directly and
// broke (403) for anything outside the one public prefix, like
// organizer logos and ticket / certificate design images.
export const MEDIA_URL_PREFIX = '/api/uploads';

export function isS3Configured(): boolean {
  return Boolean(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY && process.env.AWS_REGION);
}

let cachedClient: S3Client | null = null;

function getClient(): S3Client {
  if (cachedClient) return cachedClient;
  cachedClient = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY!,
      secretAccessKey: process.env.S3_SECRET_KEY!,
    },
  });
  return cachedClient;
}

export class S3NotConfiguredError extends Error {
  constructor() {
    super('S3 storage is not configured (S3_BUCKET / S3_ACCESS_KEY / S3_SECRET_KEY / AWS_REGION)');
  }
}

export async function uploadFileToS3(localFilePath: string, key: string, contentType: string): Promise<string> {
  if (!isS3Configured()) throw new S3NotConfiguredError();

  const body = await fs.promises.readFile(localFilePath);
  await getClient().send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );

  return `${MEDIA_URL_PREFIX}/${key}`;
}

export interface S3Object {
  body: Buffer;
  contentType: string | undefined;
}

// null when the object doesn't exist.
export async function getS3Object(key: string): Promise<S3Object | null> {
  if (!isS3Configured()) throw new S3NotConfiguredError();
  try {
    const out = await getClient().send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
    const bytes = await out.Body?.transformToByteArray();
    return bytes ? { body: Buffer.from(bytes), contentType: out.ContentType } : null;
  } catch (err) {
    const name = (err as { name?: string }).name;
    if (name === 'NoSuchKey' || name === 'NotFound') return null;
    throw err;
  }
}

export function legacyS3UrlPrefix(): string | null {
  return process.env.S3_BUCKET && process.env.AWS_REGION ? `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/` : null;
}

export async function deleteFileFromS3(key: string): Promise<void> {
  if (!isS3Configured()) throw new S3NotConfiguredError();
  await getClient().send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
}

// Recovers the object key from a URL this module generated — the
// inverse of the URL built in uploadFileToS3, used when deleting.
// Both the current /api/uploads/<key> links (when S3 is in use) and the
// older direct bucket URLs. Never a key that climbs out of the bucket
// root.
export function s3KeyFromUrl(url: string): string | null {
  let key: string | null = null;
  const legacy = legacyS3UrlPrefix();
  if (legacy && url.startsWith(legacy)) key = url.slice(legacy.length);
  else if (isS3Configured() && url.startsWith(`${MEDIA_URL_PREFIX}/`)) key = url.slice(MEDIA_URL_PREFIX.length + 1);
  if (!key) return null;
  key = key.split(/[?#]/)[0];
  return key && !key.split('/').some((part) => part === '..' || part === '') ? key : null;
}
