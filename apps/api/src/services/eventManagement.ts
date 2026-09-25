import { sequelize } from '../db/connection';
import { Event, TicketCategory, Organizer, Booking, EventMedia } from '../models';
import type {
  CreateEventTicketTier,
  CreateEventScheduleItem,
  CreateEventPackingItem,
  CreateEventFaqItem,
  CreateEventLocationPoint,
  CreateEventPartner,
} from './eventCreation';
import type { EventLocationPoint, EventPartner } from '../models/Event';
import { istParts, parseIstDateTime } from './istTime';
import {
  ValidationError,
  sanitizeScheduleItems,
  sanitizePackingChecklist,
  sanitizeFaqItems,
  sanitizeLocationPoints,
  sanitizePartners,
  sanitizeTicketBackgroundUrl,
} from './eventCreation';

export class NotFoundError extends Error {}
export class ForbiddenError extends Error {}

async function requireOwnedEvent(eventId: string, organizerId: string): Promise<Event> {
  const event = await Event.findByPk(eventId);
  if (!event) throw new NotFoundError('Event not found');
  if (event.organizerId !== organizerId) throw new ForbiddenError('You do not have access to this event');
  return event;
}

export interface OrganizerEventDetail {
  id: string;
  slug: string | null;
  title: string;
  shortDescription: string | null;
  description: string | null;
  eventDate: string;
  venueAddress: string | null;
  venueLatitude: number | null;
  venueLongitude: number | null;
  bannerImage: string | null;
  status: string;
  scheduleItems: CreateEventScheduleItem[] | null;
  packingChecklist: CreateEventPackingItem[] | null;
  faqItems: CreateEventFaqItem[] | null;
  locationPoints: EventLocationPoint[] | null;
  ticketBackgroundUrl: string | null;
  partners: EventPartner[];
  certificateEnabled: boolean;
  cancellationPolicy: string | null;
  allowSelfServiceCancellation: boolean;
  refundCutoffDays: number | null;
  refundPercentage: number | null;
  genderRestriction: 'male' | 'female' | null;
  ticketTiers: {
    id: string;
    name: string;
    description: string | null;
    price: number;
    quantity: number;
    sold: number; // quotaTotal - quotaRemaining — how many are already committed, and so protected from a shrinking edit
  }[];
  // The event's uploaded photos/video in upload order — the first photo
  // is its cover. Lets the edit screen show (and remove) what's already
  // there, not just stage new files.
  media: { id: string; mediaType: 'photo' | 'video'; url: string }[];
  galleryUrl: string | null;
  galleryNote: string | null;
}

export async function getOrganizerEvent(eventId: string, organizerId: string): Promise<OrganizerEventDetail> {
  const event = await requireOwnedEvent(eventId, organizerId);
  const [tiers, media] = await Promise.all([
    TicketCategory.findAll({ where: { eventId: event.id }, order: [['createdAt', 'ASC']] }),
    EventMedia.findAll({ where: { eventId: event.id }, order: [['createdAt', 'ASC']] }),
  ]);

  return {
    id: event.id,
    slug: event.slug,
    title: event.name,
    shortDescription: event.tagline,
    description: event.description,
    eventDate: event.eventDate.toISOString(),
    venueAddress: event.venueAddress,
    venueLatitude: event.venueLatitude,
    venueLongitude: event.venueLongitude,
    bannerImage: event.bannerUrl,
    status: event.status,
    scheduleItems: event.scheduleItems,
    packingChecklist: event.packingChecklist,
    faqItems: event.faqItems,
    locationPoints: event.locationPoints ?? null,
    ticketBackgroundUrl: event.ticketBackgroundUrl ?? null,
    partners: event.partners ?? [],
    certificateEnabled: event.certificateEnabled,
    cancellationPolicy: event.cancellationPolicy,
    allowSelfServiceCancellation: event.allowSelfServiceCancellation,
    refundCutoffDays: event.refundCutoffDays,
    refundPercentage: event.refundPercentage,
    genderRestriction: event.genderRestriction,
    ticketTiers: tiers.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      price: t.pricePaise / 100,
      quantity: t.quotaTotal,
      sold: t.quotaTotal - t.quotaRemaining,
    })),
    media: media.map((m) => ({ id: m.id, mediaType: m.mediaType, url: m.url })),
    galleryUrl: event.galleryUrl ?? null,
    galleryNote: event.galleryNote ?? null,
  };
}

export interface UpdateEventTicketTier extends CreateEventTicketTier {
  id?: string; // present for an existing tier being edited; absent for a new one
}

export interface UpdateEventParams {
  eventId: string;
  organizerId: string;
  title?: string;
  shortDescription?: string;
  description?: string;
  startDate?: string;
  startTime?: string;
  venueName?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  venueLatitude?: number | null;
  venueLongitude?: number | null;
  bannerImage?: string;
  scheduleItems?: CreateEventScheduleItem[];
  packingChecklist?: CreateEventPackingItem[];
  faqItems?: CreateEventFaqItem[];
  locationPoints?: CreateEventLocationPoint[];
  ticketBackgroundUrl?: string | null;
  partners?: CreateEventPartner[] | null;
  certificateEnabled?: boolean;
  cancellationPolicy?: string;
  allowSelfServiceCancellation?: boolean;
  refundCutoffDays?: number;
  refundPercentage?: number;
  ticketTiers?: UpdateEventTicketTier[];
  status?: 'draft' | 'published' | 'closed';
  genderRestriction?: 'male' | 'female' | null;
}

export async function updateOrganizerEvent(params: UpdateEventParams): Promise<{ id: string; slug: string | null }> {
  const event = await requireOwnedEvent(params.eventId, params.organizerId);

  return sequelize.transaction(async (t) => {
    if (params.title !== undefined && !params.title.trim()) {
      throw new ValidationError('Event title is required');
    }

    let eventDate = event.eventDate;
    if (params.startDate !== undefined || params.startTime !== undefined) {
      const current = istParts(event.eventDate);
      const parsed = parseIstDateTime(params.startDate ?? current.date, params.startTime ?? current.time);
      if (Number.isNaN(parsed.getTime())) throw new ValidationError('Invalid start date/time');
      eventDate = parsed;
    }

    const venueAddress =
      params.venueName !== undefined ||
      params.address !== undefined ||
      params.city !== undefined ||
      params.state !== undefined ||
      params.pincode !== undefined
        ? [params.venueName, params.address, params.city, params.state, params.pincode]
            .map((s) => s?.trim())
            .filter(Boolean)
            .join(', ') || null
        : event.venueAddress;

    let existingTiers: TicketCategory[] = [];
    let totalCapacity = event.capacity;

    if (params.ticketTiers) {
      // FOR UPDATE: each tier's quota_remaining is rewritten below as
      // an absolute value (newTotal - sold), so it must be computed from
      // numbers no booking can change underneath it. Without the lock, a
      // booking committing between this read and that write had its
      // decrement silently overwritten — tickets sold, but counted as
      // still available, i.e. oversold. Concurrent bookings now simply
      // wait for this edit to commit (and vice versa).
      existingTiers = await TicketCategory.findAll({ where: { eventId: event.id }, transaction: t, lock: t.LOCK.UPDATE });
      const existingById = new Map(existingTiers.map((tier) => [tier.id, tier]));
      const keptIds = new Set<string>();

      for (const tier of params.ticketTiers) {
        if (!tier.name?.trim()) throw new ValidationError('Every ticket tier needs a name');
        if (!(tier.price >= 0)) throw new ValidationError(`Invalid price for tier "${tier.name}"`);
        if (!(tier.quantity > 0)) throw new ValidationError(`Invalid quantity for tier "${tier.name}"`);

        if (tier.id) {
          const existing = existingById.get(tier.id);
          if (!existing) throw new ValidationError('One of the submitted ticket tiers no longer exists');
          keptIds.add(tier.id);
          const sold = existing.quotaTotal - existing.quotaRemaining;

          // A tier nobody has bought yet can change freely. One that's
          // already sold tickets can still have its name/description
          // updated and its capacity raised, but its price is locked —
          // changing what someone already paid, after the fact, isn't
          // something an edit screen should be able to quietly do — and
          // its capacity can't drop below what's already been sold,
          // which would make quotaRemaining negative.
          if (sold > 0) {
            if (Math.round(tier.price * 100) !== existing.pricePaise) {
              throw new ValidationError(`Cannot change the price of "${tier.name}" — it already has ${sold} ticket(s) sold`);
            }
            if (tier.quantity < sold) {
              throw new ValidationError(`Cannot set "${tier.name}"'s quantity below the ${sold} already sold`);
            }
          }

          const newQuotaTotal = Math.round(tier.quantity);
          await existing.update(
            {
              name: tier.name.trim(),
              description: tier.description?.trim() || null,
              pricePaise: Math.round(tier.price * 100),
              quotaTotal: newQuotaTotal,
              quotaRemaining: newQuotaTotal - sold,
            },
            { transaction: t },
          );
        } else {
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
      }

      // Any existing tier not present in this submission is being
      // removed — but only if nothing has sold from it. A tier with
      // real bookings against it must stay, even if the organizer's
      // edit dropped it from the list, or those bookings would point
      // at a ticket category that no longer exists.
      for (const existing of existingTiers) {
        if (!keptIds.has(existing.id)) {
          const sold = existing.quotaTotal - existing.quotaRemaining;
          if (sold > 0) {
            throw new ValidationError(`Cannot remove "${existing.name}" — it already has ${sold} ticket(s) sold`);
          }
          await existing.destroy({ transaction: t });
        }
      }

      const finalTiers = await TicketCategory.findAll({ where: { eventId: event.id }, transaction: t });
      totalCapacity = finalTiers.reduce((sum, tier) => sum + tier.quotaTotal, 0);
    }

    const nextStatus = params.status ?? event.status;
    if (nextStatus === 'published') {
      const tiersForGate = params.ticketTiers
        ? await TicketCategory.findAll({ where: { eventId: event.id }, transaction: t })
        : await TicketCategory.findAll({ where: { eventId: event.id } });
      const hasPaidTier = tiersForGate.some((tier) => tier.pricePaise > 0);
      if (hasPaidTier) {
        const organizer = await Organizer.findByPk(params.organizerId, { transaction: t });
        if (!organizer || organizer.cashfreeVendorStatus !== 'active') {
          throw new ValidationError(
            'Complete payment verification before publishing an event with paid tickets — see Organizer Verification in your account settings.',
          );
        }
      }
    }

    const nextAllowSelfService = params.allowSelfServiceCancellation ?? event.allowSelfServiceCancellation;
    const nextRefundCutoffDays = params.refundCutoffDays ?? event.refundCutoffDays;
    const nextRefundPercentage = params.refundPercentage ?? event.refundPercentage;
    if (nextAllowSelfService) {
      if (!(Number.isInteger(nextRefundCutoffDays) && nextRefundCutoffDays! >= 0)) {
        throw new ValidationError('Refund cutoff (days before event) must be a whole number, 0 or more');
      }
      if (!(Number.isInteger(nextRefundPercentage) && nextRefundPercentage! >= 0 && nextRefundPercentage! <= 100)) {
        throw new ValidationError('Refund percentage must be a whole number from 0 to 100');
      }
    }

    // The slug deliberately never changes here, even when the title
    // does — it's already out in the world in shared links and search
    // results once an event has been published, and silently breaking
    // those on every title tweak would be worse than a slug that no
    // longer matches the latest title exactly.
    await event.update(
      {
        name: params.title?.trim() ?? event.name,
        tagline: params.shortDescription !== undefined ? params.shortDescription.trim() || null : event.tagline,
        description: params.description !== undefined ? params.description.trim() || null : event.description,
        venueAddress,
        venueLatitude: params.venueLatitude !== undefined ? params.venueLatitude : event.venueLatitude,
        venueLongitude: params.venueLongitude !== undefined ? params.venueLongitude : event.venueLongitude,
        eventDate,
        bannerUrl: params.bannerImage !== undefined ? params.bannerImage.trim() || null : event.bannerUrl,
        scheduleItems: params.scheduleItems !== undefined ? sanitizeScheduleItems(params.scheduleItems) : event.scheduleItems,
        packingChecklist: params.packingChecklist !== undefined ? sanitizePackingChecklist(params.packingChecklist) : event.packingChecklist,
        faqItems: params.faqItems !== undefined ? sanitizeFaqItems(params.faqItems) : event.faqItems,
        locationPoints: params.locationPoints !== undefined ? sanitizeLocationPoints(params.locationPoints) : event.locationPoints,
        ticketBackgroundUrl:
          params.ticketBackgroundUrl !== undefined ? sanitizeTicketBackgroundUrl(params.ticketBackgroundUrl) : event.ticketBackgroundUrl,
        partners: params.partners !== undefined ? sanitizePartners(params.partners) : event.partners,
        certificateEnabled: params.certificateEnabled ?? event.certificateEnabled,
        cancellationPolicy: params.cancellationPolicy !== undefined ? params.cancellationPolicy.trim() || null : event.cancellationPolicy,
        allowSelfServiceCancellation: nextAllowSelfService,
        refundCutoffDays: nextAllowSelfService ? nextRefundCutoffDays : null,
        refundPercentage: nextAllowSelfService ? nextRefundPercentage : null,
        status: nextStatus,
        capacity: totalCapacity,
        genderRestriction: params.genderRestriction !== undefined ? params.genderRestriction : event.genderRestriction,
      },
      { transaction: t },
    );

    return { id: event.id, slug: event.slug };
  });
}

export async function deleteOrganizerEvent(eventId: string, organizerId: string): Promise<void> {
  const event = await requireOwnedEvent(eventId, organizerId);

  const bookingCount = await Booking.count({ where: { eventId: event.id } });
  if (bookingCount > 0) {
    throw new ValidationError(
      `Cannot delete an event with ${bookingCount} booking(s) — close or cancel it instead to keep those bookings intact.`,
    );
  }

  await sequelize.transaction(async (t) => {
    await TicketCategory.destroy({ where: { eventId: event.id }, transaction: t });
    await event.destroy({ transaction: t });
  });
}
