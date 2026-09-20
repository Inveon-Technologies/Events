import { sequelize } from '../db/connection';
import { Event, TicketCategory } from '../models';

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
  ticketTiers: CreateEventTicketTier[];
  status: 'draft' | 'published';
}

export class ValidationError extends Error {}

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

  const eventDate = new Date(`${params.startDate}T${params.startTime}:00`);
  if (Number.isNaN(eventDate.getTime())) {
    throw new ValidationError('Invalid start date/time');
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
