import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';

// No ACL is set on upload, deliberately — buckets created since April
// 2023 default to "Bucket owner enforced" (ACLs disabled entirely), and
// PutObjectCommand with ACL: 'public-read' against one of those fails
// outright. Public read access has to come from a bucket policy
// instead, which is an AWS-console-side step outside what this code (or
// this environment, which has no network path to AWS's API either) can
// configure — see the setup note this module's consumers surface when
// S3 isn't reachable.

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

  return `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
}

export async function deleteFileFromS3(key: string): Promise<void> {
  if (!isS3Configured()) throw new S3NotConfiguredError();
  await getClient().send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
}

// Recovers the object key from a URL this module generated — the
// inverse of the URL built in uploadFileToS3, used when deleting.
export function s3KeyFromUrl(url: string): string | null {
  const prefix = `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/`;
  return url.startsWith(prefix) ? url.slice(prefix.length) : null;
}
