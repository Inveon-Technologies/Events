import { Op, WhereOptions } from 'sequelize';
import { Organizer, Event, EventMedia, TicketCategory } from '../models';
import { deriveEventStatus, DisplayEventStatus } from './organizerEvents';
import { getEventRatingSummary } from './eventReviews';
import { buildVenueMapUrl } from './mapsUrl';

// Data returned by the external read API (/api/v1), for an organizer's
// own website/app. Only the organizer's event content — never customer
// bookings or payment details, which a key embedded in a website could
// otherwise leak.

export class NotFoundError extends Error {}

// Uploaded media is stored with a site-relative URL (/api/uploads/...);
// another website needs the full address.
function absoluteUrl(url: string | null): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const base = process.env.API_PUBLIC_URL?.replace(/\/$/, '');
  return base ? `${base}${url}` : url;
}

function publicEventPageUrl(slugOrId: string): string | null {
  const base = (process.env.WEB_PUBLIC_URL || process.env.API_PUBLIC_URL)?.replace(/\/$/, '');
  return base ? `${base}/events/${slugOrId}` : null;
}

export interface IntegrationOrganizer {
  id: string;
  name: string;
  slug: string;
  about: string | null;
  logoUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
}

export async function getIntegrationOrganizer(organizerId: string): Promise<IntegrationOrganizer> {
  const organizer = await Organizer.findByPk(organizerId);
  if (!organizer) throw new NotFoundError('Organizer not found');
  return {
    id: organizer.id,
    name: organizer.name,
    slug: organizer.slug,
    about: organizer.about,
    logoUrl: absoluteUrl(organizer.logoUrl),
    contactEmail: organizer.contactEmail,
    contactPhone: organizer.contactPhone,
    website: organizer.website,
  };
}

interface TicketTierOut {
  id: string;
  name: string;
  description: string | null;
  pricePaise: number;
  maxPerBooking: number;
  totalQuantity: number;
  available: number;
}

export interface IntegrationEventSummary {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  status: DisplayEventStatus;
  eventDate: string;
  venueAddress: string | null;
  coverImageUrl: string | null;
  minPricePaise: number | null;
  ticketsAvailable: number;
  publicUrl: string | null;
}

export interface IntegrationEventDetail extends IntegrationEventSummary {
  description: string | null;
  gateOpenTime: string | null;
  venueLatitude: number | null;
  venueLongitude: number | null;
  venueMapUrl: string | null;
  genderRestriction: 'male' | 'female' | null;
  scheduleItems: unknown[] | null;
  packingChecklist: unknown[] | null;
  faqItems: unknown[] | null;
  termsAndConditions: string | null;
  cancellationPolicy: string | null;
  refundPolicy: { selfServiceCancellation: boolean; refundCutoffDays: number | null; refundPercentage: number | null };
  ticketTiers: TicketTierOut[];
  images: { id: string; url: string }[];
  videos: { id: string; url: string }[];
  galleryUrl: string | null;
  rating: { averageRating: number | null; reviewCount: number };
  updatedAt: string;
}

function summarize(event: Event, tiers: TicketCategory[], coverUrl: string | null, now: Date): IntegrationEventSummary {
  const prices = tiers.map((t) => t.pricePaise);
  const slug = event.slug ?? event.id;
  return {
    id: event.id,
    slug,
    name: event.name,
    tagline: event.tagline,
    status: deriveEventStatus(event.status, event.eventDate, now),
    eventDate: event.eventDate.toISOString(),
    venueAddress: event.venueAddress,
    coverImageUrl: absoluteUrl(coverUrl),
    minPricePaise: prices.length ? Math.min(...prices) : null,
    ticketsAvailable: tiers.reduce((sum, t) => sum + t.quotaRemaining, 0),
    publicUrl: event.status === 'draft' ? null : publicEventPageUrl(slug),
  };
}

export interface ListIntegrationEventsParams {
  organizerId: string;
  status?: DisplayEventStatus | 'all';
  includeDrafts?: boolean;
  page?: number;
  pageSize?: number;
}

export async function listIntegrationEvents(params: ListIntegrationEventsParams) {
  const page = params.page && params.page > 0 ? Math.floor(params.page) : 1;
  const pageSize = params.pageSize && params.pageSize > 0 ? Math.min(Math.floor(params.pageSize), 100) : 20;
  const now = new Date();

  // Drafts are private until published — only returned when asked for.
  const where: WhereOptions = { organizerId: params.organizerId };
  if (!params.includeDrafts) Object.assign(where, { status: { [Op.ne]: 'draft' } });

  const events = await Event.findAll({ where, order: [['eventDate', 'DESC']] });
  const eventIds = events.map((e) => e.id);
  const [tiers, photos] = await Promise.all([
    TicketCategory.findAll({ where: { eventId: eventIds } }),
    EventMedia.findAll({ where: { eventId: eventIds, mediaType: 'photo' }, order: [['createdAt', 'ASC']] }),
  ]);

  const tiersByEvent = new Map<string, TicketCategory[]>();
  for (const t of tiers) tiersByEvent.set(t.eventId, [...(tiersByEvent.get(t.eventId) ?? []), t]);
  const firstPhoto = new Map<string, string>();
  for (const p of photos) if (!firstPhoto.has(p.eventId)) firstPhoto.set(p.eventId, p.url);

  const all = events
    .map((e) => summarize(e, tiersByEvent.get(e.id) ?? [], e.bannerUrl ?? firstPhoto.get(e.id) ?? null, now))
    .filter((e) => !params.status || params.status === 'all' || e.status === params.status);

  return {
    events: all.slice((page - 1) * pageSize, page * pageSize),
    pagination: { page, pageSize, total: all.length },
  };
}

// By id or slug, scoped to this organizer — another organizer's event
// is indistinguishable from one that doesn't exist.
export async function getIntegrationEvent(organizerId: string, idOrSlug: string, includeDrafts = false): Promise<IntegrationEventDetail> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
  const event = await Event.findOne({
    where: { organizerId, ...(isUuid ? { [Op.or]: [{ id: idOrSlug }, { slug: idOrSlug }] } : { slug: idOrSlug }) },
  });
  if (!event || (event.status === 'draft' && !includeDrafts)) throw new NotFoundError('Event not found');

  const [tiers, media, rating] = await Promise.all([
    TicketCategory.findAll({ where: { eventId: event.id }, order: [['createdAt', 'ASC']] }),
    EventMedia.findAll({ where: { eventId: event.id }, order: [['createdAt', 'ASC']] }),
    getEventRatingSummary(event.id),
  ]);
  const photos = media.filter((m) => m.mediaType === 'photo');
  const videos = media.filter((m) => m.mediaType === 'video');

  return {
    ...summarize(event, tiers, event.bannerUrl ?? photos[0]?.url ?? null, new Date()),
    description: event.description,
    gateOpenTime: event.gateOpenTime?.toISOString() ?? null,
    venueLatitude: event.venueLatitude !== null ? Number(event.venueLatitude) : null,
    venueLongitude: event.venueLongitude !== null ? Number(event.venueLongitude) : null,
    venueMapUrl: buildVenueMapUrl(event.venueAddress, event.venueMapUrl, event.venueLatitude, event.venueLongitude),
    genderRestriction: event.genderRestriction,
    scheduleItems: event.scheduleItems,
    packingChecklist: event.packingChecklist,
    faqItems: event.faqItems,
    termsAndConditions: event.termsAndConditions,
    cancellationPolicy: event.cancellationPolicy,
    refundPolicy: {
      selfServiceCancellation: event.allowSelfServiceCancellation,
      refundCutoffDays: event.refundCutoffDays,
      refundPercentage: event.refundPercentage,
    },
    ticketTiers: tiers.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      pricePaise: t.pricePaise,
      maxPerBooking: t.maxPerBooking,
      totalQuantity: t.quotaTotal,
      available: t.quotaRemaining,
    })),
    images: photos.map((m) => ({ id: m.id, url: absoluteUrl(m.url)! })),
    videos: videos.map((m) => ({ id: m.id, url: absoluteUrl(m.url)! })),
    galleryUrl: event.galleryUrl ?? null,
    rating,
    updatedAt: event.updatedAt.toISOString(),
  };
}
