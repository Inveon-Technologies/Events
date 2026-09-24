import { Event } from '../models';

export class ValidationError extends Error {}
export class NotFoundError extends Error {}
export class ForbiddenError extends Error {}

// Where organizers keep event photos/videos. Only these hosts are
// accepted: the link is shown to every attendee as "your event photos",
// so an arbitrary URL would turn this into a way to send customers to
// any site under the platform's name.
const ALLOWED_GALLERY_HOSTS = new Set([
  'drive.google.com',
  'photos.google.com',
  'photos.app.goo.gl',
  'goo.gl',
]);

export function normalizeGalleryUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new ValidationError('Enter a full link, starting with https://');
  }
  if (url.protocol !== 'https:') {
    throw new ValidationError('The link must start with https://');
  }
  if (!ALLOWED_GALLERY_HOSTS.has(url.hostname.toLowerCase())) {
    throw new ValidationError('Use a Google Drive or Google Photos share link (drive.google.com or photos.google.com)');
  }
  return url.toString();
}

export interface EventGallery {
  galleryUrl: string | null;
  galleryNote: string | null;
  galleryUpdatedAt: string | null;
}

// Set (or clear, with url null/empty) the post-event photo/video link.
// Only once the event has started — before that there's nothing to
// share, and the option is presented as an after-the-event step.
export async function setEventGallery(params: {
  eventId: string;
  organizerId: string;
  url: string | null;
  note: string | null;
}): Promise<EventGallery> {
  const event = await Event.findByPk(params.eventId);
  if (!event) throw new NotFoundError('Event not found');
  if (event.organizerId !== params.organizerId) throw new ForbiddenError('This event does not belong to your organization');
  if (event.eventDate.getTime() > Date.now()) {
    throw new ValidationError('You can add a photos & videos link once the event has taken place');
  }

  const clearing = !params.url || !params.url.trim();
  const note = params.note?.trim() || null;
  if (note && note.length > 500) throw new ValidationError('Keep the note under 500 characters');

  await event.update({
    galleryUrl: clearing ? null : normalizeGalleryUrl(params.url!),
    galleryNote: clearing ? null : note,
    galleryUpdatedAt: clearing ? null : new Date(),
  });

  return {
    galleryUrl: event.galleryUrl ?? null,
    galleryNote: event.galleryNote ?? null,
    galleryUpdatedAt: event.galleryUpdatedAt?.toISOString() ?? null,
  };
}
