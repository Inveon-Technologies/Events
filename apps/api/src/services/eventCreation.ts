import { sequelize } from '../db/connection';
import { Event, TicketCategory, Organizer } from '../models';

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
  bannerImage?: string;
  cancellationPolicyDescription?: string;
  allowSelfServiceCancellation?: boolean;
  refundCutoffDays?: number;
  refundPercentage?: number;
  ticketTiers: CreateEventTicketTier[];
  scheduleItems?: CreateEventScheduleItem[];
  packingChecklist?: CreateEventPackingItem[];
  faqItems?: CreateEventFaqItem[];
  status: 'draft' | 'published';
}

export class ValidationError extends Error {}

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

  const eventDate = new Date(`${params.startDate}T${params.startTime}:00`);
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
        eventDate,
        bannerUrl: params.bannerImage?.trim() || null,
        cancellationPolicy: params.cancellationPolicyDescription?.trim() || null,
        allowSelfServiceCancellation: params.allowSelfServiceCancellation ?? false,
        refundCutoffDays: params.allowSelfServiceCancellation ? params.refundCutoffDays ?? null : null,
        refundPercentage: params.allowSelfServiceCancellation ? params.refundPercentage ?? null : null,
        scheduleItems: sanitizeScheduleItems(params.scheduleItems),
        packingChecklist: sanitizePackingChecklist(params.packingChecklist),
        faqItems: sanitizeFaqItems(params.faqItems),
        status: params.status,
        capacity: totalCapacity,
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
