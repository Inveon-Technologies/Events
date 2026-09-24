import fs from 'fs/promises';

// Moves an uploaded temp file into the upload directory. A plain
// fs.rename only works within one filesystem — multer writes to the OS
// temp dir, and in production UPLOAD_DIR is a mounted Docker volume
// (see .env.example), so rename fails there with EXDEV and every
// local-disk upload (organizer logos, event photos) failed with a
// generic 500. Falls back to copy + delete across filesystems.
export async function moveFile(from: string, to: string): Promise<void> {
  try {
    await fs.rename(from, to);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err;
    await fs.copyFile(from, to);
    await fs.unlink(from).catch(() => undefined);
  }
}
