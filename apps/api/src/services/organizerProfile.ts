import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { Organizer, User } from '../models';
import { isS3Configured, uploadFileToS3, deleteFileFromS3, s3KeyFromUrl } from './s3Storage';
import { UPLOAD_DIR, UPLOAD_URL_PREFIX, MAX_FILE_SIZE_BYTES, sniffImageMimeType } from './eventMedia';

export class NotFoundError extends Error {}
export class ValidationError extends Error {}

export interface OrganizerProfile {
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  about: string | null;
  logoUrl: string | null;
  gstNumber: string | null;
  website: string | null;
}

export async function getOrganizerProfile(organizerId: string): Promise<OrganizerProfile> {
  const organizer = await Organizer.findByPk(organizerId);
  if (!organizer) throw new NotFoundError('Organizer not found');
  return {
    name: organizer.name,
    contactEmail: organizer.contactEmail,
    contactPhone: organizer.contactPhone,
    about: organizer.about,
    logoUrl: organizer.logoUrl,
    gstNumber: organizer.gstNumber,
    website: organizer.website,
  };
}

export interface UpdateOrganizerProfileParams {
  organizerId: string;
  name?: string;
  contactEmail?: string;
  contactPhone?: string;
  about?: string;
  gstNumber?: string;
  website?: string;
}

export async function updateOrganizerProfile(params: UpdateOrganizerProfileParams): Promise<OrganizerProfile> {
  const organizer = await Organizer.findByPk(params.organizerId);
  if (!organizer) throw new NotFoundError('Organizer not found');

  if (params.name !== undefined && !params.name.trim()) {
    throw new ValidationError('Organizer name cannot be empty');
  }

  await organizer.update({
    name: params.name !== undefined ? params.name.trim() : organizer.name,
    contactEmail: params.contactEmail !== undefined ? params.contactEmail.trim() || null : organizer.contactEmail,
    contactPhone: params.contactPhone !== undefined ? params.contactPhone.trim() || null : organizer.contactPhone,
    about: params.about !== undefined ? params.about.trim() || null : organizer.about,
    gstNumber: params.gstNumber !== undefined ? params.gstNumber.trim() || null : organizer.gstNumber,
    website: params.website !== undefined ? params.website.trim() || null : organizer.website,
  });

  return {
    name: organizer.name,
    contactEmail: organizer.contactEmail,
    contactPhone: organizer.contactPhone,
    about: organizer.about,
    logoUrl: organizer.logoUrl,
    gstNumber: organizer.gstNumber,
    website: organizer.website,
  };
}

const ALLOWED_LOGO_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function extensionForMimeType(mime: string): string {
  const map: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
  return map[mime] || '';
}

export interface UploadLogoParams {
  organizerId: string;
  mimeType: string;
  sizeBytes: number;
  tempFilePath: string;
}

// A logo replaces whatever the organizer had before, rather than
// accumulating like event media does — there's only ever one, so the
// previous file (S3 object or local disk file) is deleted once the
// new one is safely in place.
export async function uploadOrganizerLogo(params: UploadLogoParams): Promise<{ logoUrl: string }> {
  const organizer = await Organizer.findByPk(params.organizerId);
  if (!organizer) throw new NotFoundError('Organizer not found');

  if (params.sizeBytes > MAX_FILE_SIZE_BYTES) {
    throw new ValidationError(`File is too large — the limit is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`);
  }
  if (!ALLOWED_LOGO_MIME_TYPES.has(params.mimeType)) {
    throw new ValidationError('Unsupported file type — logo must be JPEG, PNG, or WebP');
  }
  // The declared type is only the client's claim — store and serve the
  // real one from the file's own bytes (same check as event images).
  const mimeType = await sniffImageMimeType(params.tempFilePath);
  if (!mimeType) {
    await fs.unlink(params.tempFilePath).catch(() => {});
    throw new ValidationError('This file is not a valid JPEG, PNG, or WebP image');
  }

  const previousUrl = organizer.logoUrl;
  const filename = `${crypto.randomUUID()}${extensionForMimeType(mimeType)}`;
  let url: string;

  if (isS3Configured()) {
    const key = `organizers/${params.organizerId}/${filename}`;
    url = await uploadFileToS3(params.tempFilePath, key, mimeType);
    await fs.unlink(params.tempFilePath).catch(() => {});
  } else {
    const orgDir = path.join(UPLOAD_DIR, 'organizers', params.organizerId);
    await fs.mkdir(orgDir, { recursive: true });
    const destPath = path.join(orgDir, filename);
    await fs.rename(params.tempFilePath, destPath);
    url = `${UPLOAD_URL_PREFIX}/organizers/${params.organizerId}/${filename}`;
  }

  await organizer.update({ logoUrl: url });

  if (previousUrl) {
    const s3Key = s3KeyFromUrl(previousUrl);
    if (s3Key) {
      await deleteFileFromS3(s3Key).catch(() => {});
    } else {
      const relativePath = previousUrl.replace(`${UPLOAD_URL_PREFIX}/`, '');
      await fs.unlink(path.join(UPLOAD_DIR, relativePath)).catch(() => {});
    }
  }

  return { logoUrl: url };
}

export interface OrganizerTeamMember {
  id: string;
  name: string | null;
  email: string;
  role: string;
  createdAt: string;
}

// Read-only for now — every user actually tied to this organizer via
// User.organizerId. There is no invitation system in this codebase
// (no invite tokens, no accept-invite flow, no email delivery for
// this purpose) — building one is a real, separate feature, not a
// mock-to-real wiring fix, so this deliberately doesn't pretend to
// support inviting or removing anyone.
export async function getOrganizerTeam(organizerId: string): Promise<OrganizerTeamMember[]> {
  const users = await User.findAll({ where: { organizerId }, order: [['createdAt', 'ASC']] });
  return users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt.toISOString() }));
}
