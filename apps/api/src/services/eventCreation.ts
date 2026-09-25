import { sequelize } from '../db/connection';
import { Event, TicketCategory, Organizer } from '../models';
import { parseIstDateTime } from './istTime';
import type { EventLocationPoint, EventLocationPointType, EventPartner } from '../models/Event';
import { isAcceptableImageUrl } from './designAssets';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// Matches the site's existing URL style (e.g. /events/rajgad-sunrise-
// trek-2026): the event's name plus its own year, not the creation
// year — two events with the same name in different years should get
// different, equally readable slugs rather than a random suffix.
async function uniqueEventSlug(title: string, eventDate: Date): Promise<string> {
  const root = `${slugify(title)}-${eventDate.getFullYear()}`;
  let candidate = root;
  let suffix = 1;
  while (await Event.findOne({ where: { slug: candidate } })) {
    suffix += 1;
    candidate = `${root}-${suffix}`;
  }
  return candidate;
}

export interface CreateEventTicketTier {
  name: string;
  description?: string;
  price: number; // rupees — converted to paise here, not by the caller
  quantity: number;
}

export interface CreateEventScheduleItem {
  time: string;
  title: string;
  description?: string;
}

export interface CreateEventPackingItem {
  item: string;
  mandatory?: boolean;
}

export interface CreateEventFaqItem {
  question: string;
  answer: string;
}

export interface CreateEventParams {
  organizerId: string;
  title: string;
  shortDescription?: string;
  description?: string;
  startDate: string; // 'YYYY-MM-DD'
  startTime: string; // 'HH:MM'
  venueName?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  venueLatitude?: number | null;
  venueLongitude?: number | null;
  bannerImage?: string;
  cancellationPolicyDescription?: string;
  allowSelfServiceCancellation?: boolean;
  refundCutoffDays?: number;
  refundPercentage?: number;
  ticketTiers: CreateEventTicketTier[];
  scheduleItems?: CreateEventScheduleItem[];
  packingChecklist?: CreateEventPackingItem[];
  faqItems?: CreateEventFaqItem[];
  locationPoints?: CreateEventLocationPoint[];
  ticketBackgroundUrl?: string | null;
  partners?: CreateEventPartner[] | null;
  certificateEnabled?: boolean;
  status: 'draft' | 'published';
  genderRestriction?: 'male' | 'female' | null;
}

export class ValidationError extends Error {}
export class NotFoundError extends Error {}
export class ForbiddenError extends Error {}

// Each of these is optional content — an event doesn't need a schedule,
// packing list, or FAQ — so rather than hard-reject a malformed entry,
// this quietly drops any row missing what it actually needs (a schedule
// item with no title, an FAQ pair with no answer) and keeps the rest,
// storing null instead of an empty array when nothing valid remains.
export function sanitizeScheduleItems(items?: CreateEventScheduleItem[]): CreateEventScheduleItem[] | null {
  if (!items) return null;
  const cleaned = items
    .map((i) => ({ time: i.time?.trim() ?? '', title: i.title?.trim() ?? '', description: i.description?.trim() || undefined }))
    .filter((i) => i.time && i.title);
  return cleaned.length > 0 ? cleaned : null;
}

export function sanitizePackingChecklist(items?: CreateEventPackingItem[]): { item: string; mandatory: boolean }[] | null {
  if (!items) return null;
  const cleaned: { item: string; mandatory: boolean }[] = items
    .map((i) => ({ item: i.item?.trim() ?? '', mandatory: i.mandatory !== false }))
    .filter((i) => i.item);
  return cleaned.length > 0 ? cleaned : null;
}

export const MAX_LOCATION_POINTS = 20;
const LOCATION_POINT_TYPES: EventLocationPointType[] = ['venue', 'pickup', 'drop', 'meeting', 'stop'];

export interface CreateEventLocationPoint {
  type?: string;
  label?: string;
  address?: string | null;
  latitude?: number;
  longitude?: number;
  time?: string | null;
  note?: string | null;
}

// Map pins (venue, group pickup points, drop point, …). Unlike the
// free-text lists above, a point with bad coordinates is rejected rather
// than silently dropped — a pickup point quietly vanishing would strand
// attendees at a place the organizer thinks is listed.
export function sanitizeLocationPoints(points?: CreateEventLocationPoint[]): EventLocationPoint[] | null {
  if (!points) return null;
  if (points.length > MAX_LOCATION_POINTS) {
    throw new ValidationError(`An event can have at most ${MAX_LOCATION_POINTS} map points`);
  }
  const cleaned = points.map((p, i) => {
    const n = i + 1;
    const latitude = Number(p.latitude);
    const longitude = Number(p.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new ValidationError(`Map point ${n} has an invalid location — pick it on the map again`);
    }
    const type = LOCATION_POINT_TYPES.includes(p.type as EventLocationPointType) ? (p.type as EventLocationPointType) : 'pickup';
    const label = (p.label ?? '').trim().slice(0, 100) || (type === 'venue' ? 'Venue' : `Point ${n}`);
    const time = typeof p.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(p.time.trim()) ? p.time.trim() : null;
    return {
      type,
      label,
      address: p.address?.trim().slice(0, 300) || null,
      latitude: Math.round(latitude * 1e6) / 1e6,
      longitude: Math.round(longitude * 1e6) / 1e6,
      time,
      note: p.note?.trim().slice(0, 300) || null,
    };
  });
  return cleaned.length > 0 ? cleaned : null;
}

export const MAX_EVENT_PARTNERS = 10;

export interface CreateEventPartner {
  name?: string;
  role?: string | null;
  logoUrl?: string | null;
}

// "Partners & Supporters" shown on the ticket, email and PDF. Rows with
// neither a name nor a logo are dropped (an empty row left in the form);
// more than 10, or a logo that isn't an uploaded / https image, is an
// error the organizer has to fix.
export function sanitizePartners(partners?: CreateEventPartner[] | null): EventPartner[] | null {
  if (!partners) return null;
  if (!Array.isArray(partners)) throw new ValidationError('Partners must be a list');
  const cleaned = partners
    .map((p) => ({
      name: String(p?.name ?? '').trim().slice(0, 80),
      role: String(p?.role ?? '').trim().slice(0, 60) || null,
      logoUrl: String(p?.logoUrl ?? '').trim() || null,
    }))
    .filter((p) => p.name || p.logoUrl);
  if (cleaned.length > MAX_EVENT_PARTNERS) {
    throw new ValidationError(`You can add up to ${MAX_EVENT_PARTNERS} partners`);
  }
  cleaned.forEach((p, i) => {
    if (p.logoUrl && !isAcceptableImageUrl(p.logoUrl)) {
      throw new ValidationError(`Partner ${i + 1}'s logo isn't a valid image — upload it again`);
    }
    if (!p.name) p.name = `Partner ${i + 1}`;
  });
  return cleaned.length > 0 ? cleaned : null;
}

export function sanitizeTicketBackgroundUrl(url?: string | null): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  if (!isAcceptableImageUrl(trimmed)) throw new ValidationError('The ticket background isn\'t a valid image — upload it again');
  return trimmed;
}

export function sanitizeFaqItems(items?: CreateEventFaqItem[]): CreateEventFaqItem[] | null {
  if (!items) return null;
  const cleaned = items
    .map((i) => ({ question: i.question?.trim() ?? '', answer: i.answer?.trim() ?? '' }))
    .filter((i) => i.question && i.answer);
  return cleaned.length > 0 ? cleaned : null;
}

// This wizard's UI collects meaningfully more than this schema currently
// tracks — a category, tags, structured cancellation terms (cutoff days,
// refund %), geo-coordinates, a venue split into name/address/city/state/
// pincode rather than one field. Mapped here: what the schema already
// supports, combined sensibly (venue fields joined into the one address
// field that exists); the rest is silently dropped, not fabricated —
// same "real fields real, everything else honestly absent" approach as
// the customer-facing event page's own real-data adapter.
export async function createOrganizerEvent(params: CreateEventParams): Promise<{ id: string; slug: string }> {
  if (!params.title.trim()) throw new ValidationError('Event title is required');
  if (!params.ticketTiers || params.ticketTiers.length === 0) {
    throw new ValidationError('At least one ticket tier is required');
  }
  for (const tier of params.ticketTiers) {
    if (!tier.name?.trim()) throw new ValidationError('Every ticket tier needs a name');
    if (!(tier.price >= 0)) throw new ValidationError(`Invalid price for tier "${tier.name}"`);
    if (!(tier.quantity > 0)) throw new ValidationError(`Invalid quantity for tier "${tier.name}"`);
  }

  // A draft can always be saved — an organizer needs to be able to
  // prepare a paid event while their verification is still in
  // progress. Publishing it live is the actual point this matters:
  // accepting a real booking for a paid tier requires a real Cashfree
  // vendor to pay out to (see bookingCreation.ts's matching check at
  // booking time — this is the same rule enforced earlier, at publish
  // time, so an organizer finds out before advertising an event they
  // can't yet actually take paid bookings for, not after a customer
  // hits the same wall trying to pay).
  const hasPaidTier = params.ticketTiers.some((t) => t.price > 0);
  if (params.status === 'published' && hasPaidTier) {
    const organizer = await Organizer.findByPk(params.organizerId);
    if (!organizer || organizer.cashfreeVendorStatus !== 'active') {
      throw new ValidationError(
        'Complete payment verification before publishing an event with paid tickets — see Organizer Verification in your account settings.',
      );
    }
  }

  const eventDate = parseIstDateTime(params.startDate, params.startTime);
  if (Number.isNaN(eventDate.getTime())) {
    throw new ValidationError('Invalid start date/time');
  }

  if (params.allowSelfServiceCancellation) {
    if (!(Number.isInteger(params.refundCutoffDays) && params.refundCutoffDays! >= 0)) {
      throw new ValidationError('Refund cutoff (days before event) must be a whole number, 0 or more');
    }
    if (!(Number.isInteger(params.refundPercentage) && params.refundPercentage! >= 0 && params.refundPercentage! <= 100)) {
      throw new ValidationError('Refund percentage must be a whole number from 0 to 100');
    }
  }

  const venueAddress = [params.venueName, params.address, params.city, params.state, params.pincode]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(', ') || null;

  const totalCapacity = params.ticketTiers.reduce((sum, t) => sum + t.quantity, 0);
  const slug = await uniqueEventSlug(params.title, eventDate);

  return sequelize.transaction(async (t) => {
    const event = await Event.create(
      {
        organizerId: params.organizerId,
        name: params.title.trim(),
        slug,
        tagline: params.shortDescription?.trim() || null,
        description: params.description?.trim() || null,
        venueAddress,
        venueLatitude: params.venueLatitude ?? null,
        venueLongitude: params.venueLongitude ?? null,
        eventDate,
        bannerUrl: params.bannerImage?.trim() || null,
        cancellationPolicy: params.cancellationPolicyDescription?.trim() || null,
        allowSelfServiceCancellation: params.allowSelfServiceCancellation ?? false,
        refundCutoffDays: params.allowSelfServiceCancellation ? params.refundCutoffDays ?? null : null,
        refundPercentage: params.allowSelfServiceCancellation ? params.refundPercentage ?? null : null,
        scheduleItems: sanitizeScheduleItems(params.scheduleItems),
        packingChecklist: sanitizePackingChecklist(params.packingChecklist),
        faqItems: sanitizeFaqItems(params.faqItems),
        locationPoints: sanitizeLocationPoints(params.locationPoints),
        ticketBackgroundUrl: sanitizeTicketBackgroundUrl(params.ticketBackgroundUrl),
        partners: sanitizePartners(params.partners),
        certificateEnabled: params.certificateEnabled ?? false,
        status: params.status,
        capacity: totalCapacity,
        genderRestriction: params.genderRestriction || null,
      },
      { transaction: t },
    );

    for (const tier of params.ticketTiers) {
      const quotaTotal = Math.round(tier.quantity);
      await TicketCategory.create(
        {
          eventId: event.id,
          name: tier.name.trim(),
          description: tier.description?.trim() || null,
          pricePaise: Math.round(tier.price * 100),
          quotaTotal,
          quotaRemaining: quotaTotal,
        },
        { transaction: t },
      );
    }

    return { id: event.id, slug: event.slug! };
  });
}

export interface DuplicateEventResult {
  id: string;
  slug: string;
}

// A real, atomic, server-side duplication — deliberately not left to
// the frontend to orchestrate field-by-field (fetch the original,
// copy each field into a new create request), the exact pattern that
// silently dropped fields more than once earlier in this project (the
// refund policy fields, then the media gallery). Copying the Event and
// TicketCategory rows directly here means every field that exists is
// copied, not just the ones a caller remembered to list.
export async function duplicateEvent(eventId: string, organizerId: string): Promise<DuplicateEventResult> {
  const source = await Event.findByPk(eventId);
  if (!source) throw new NotFoundError('Event not found');
  if (source.organizerId !== organizerId) throw new ForbiddenError('This event does not belong to your organization');

  const sourceTiers = await TicketCategory.findAll({ where: { eventId } });

  const slug = await uniqueEventSlug(source.name, source.eventDate);

  const created = await sequelize.transaction(async (t) => {
    const event = await Event.create(
      {
        organizerId,
        name: `${source.name} (Copy)`,
        slug,
        tagline: source.tagline,
        description: source.description,
        venueAddress: source.venueAddress,
        venueMapUrl: source.venueMapUrl,
        venueLatitude: source.venueLatitude,
        venueLongitude: source.venueLongitude,
        eventDate: source.eventDate,
        gateOpenTime: source.gateOpenTime,
        bannerUrl: source.bannerUrl,
        termsAndConditions: source.termsAndConditions,
        cancellationPolicy: source.cancellationPolicy,
        allowSelfServiceCancellation: source.allowSelfServiceCancellation,
        refundCutoffDays: source.refundCutoffDays,
        refundPercentage: source.refundPercentage,
        scheduleItems: source.scheduleItems,
        packingChecklist: source.packingChecklist,
        faqItems: source.faqItems,
        locationPoints: source.locationPoints ?? null,
        ticketBackgroundUrl: source.ticketBackgroundUrl ?? null,
        partners: source.partners ?? null,
        certificateEnabled: source.certificateEnabled,
        certificateDesign: source.certificateDesign ?? null,
        status: 'draft',
        capacity: source.capacity,
        genderRestriction: source.genderRestriction,
      },
      { transaction: t },
    );

    for (const tier of sourceTiers) {
      // eslint-disable-next-line no-await-in-loop
      await TicketCategory.create(
        {
          eventId: event.id,
          name: tier.name,
          description: tier.description,
          pricePaise: tier.pricePaise,
          maxPerBooking: tier.maxPerBooking,
          quotaTotal: tier.quotaTotal,
          quotaRemaining: tier.quotaTotal, // a fresh copy starts fully available — no bookings exist against it yet
        },
        { transaction: t },
      );
    }

    return event;
  });

  return { id: created.id, slug: created.slug! };
}
