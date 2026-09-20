import { Op } from 'sequelize';
import { Organizer, Event, TicketCategory, EventScheduleItem, EventPackingItem, EventFaqItem } from '../models';

export interface PublicEventSummary {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  eventDate: string;
  venueAddress: string | null;
  bannerUrl: string | null;
  organizerName: string;
  organizerSlug: string;
  minPricePaise: number | null;
}

export interface PublicTicketCategory {
  id: string;
  name: string;
  description: string | null;
  pricePaise: number;
  maxPerBooking: number;
  available: number;
}

export interface PublicEventDetail {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  eventDate: string;
  venueAddress: string | null;
  venueMapUrl: string | null;
  bannerUrl: string | null;
  termsAndConditions: string | null;
  cancellationPolicy: string | null;
  scheduleItems: EventScheduleItem[] | null;
  packingChecklist: EventPackingItem[] | null;
  faqItems: EventFaqItem[] | null;
  organizerName: string;
  organizerSlug: string;
  ticketCategories: PublicTicketCategory[];
}

// Public — no auth, so only ever returns published events. A draft/
// cancelled event, or one that doesn't exist, is treated identically
// (404) so this can't be used to enumerate an organizer's unpublished work.
export async function listPublicEvents(): Promise<PublicEventSummary[]> {
  const events = await Event.findAll({
    where: { status: 'published', eventDate: { [Op.gte]: new Date() } },
    include: [{ model: Organizer, attributes: ['name', 'slug'] }],
    order: [['eventDate', 'ASC']],
  });

  return Promise.all(
    events.map(async (event) => {
      const cheapest = await TicketCategory.findOne({
        where: { eventId: event.id },
        order: [['pricePaise', 'ASC']],
      });
      const organizer = (event as unknown as { Organizer: Organizer }).Organizer;
      return {
        id: event.id,
        slug: event.slug ?? event.id,
        name: event.name,
        tagline: event.tagline,
        eventDate: event.eventDate.toISOString(),
        venueAddress: event.venueAddress,
        bannerUrl: event.bannerUrl,
        organizerName: organizer.name,
        organizerSlug: organizer.slug,
        minPricePaise: cheapest?.pricePaise ?? null,
      };
    }),
  );
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getPublicEvent(idOrSlug: string): Promise<PublicEventDetail | null> {
  // Comparing a non-UUID string against the id column (a real UUID type)
  // throws at the database level, not just "no match" — a slug like
  // "rajgad-sunrise-trek-2026" would crash this query if id were included
  // in the OR unconditionally. Only include it when the value actually
  // looks like a UUID.
  const where = UUID_PATTERN.test(idOrSlug)
    ? { [Op.or]: [{ id: idOrSlug }, { slug: idOrSlug }], status: 'published' as const }
    : { slug: idOrSlug, status: 'published' as const };

  const event = await Event.findOne({
    where,
    include: [{ model: Organizer, attributes: ['name', 'slug'] }],
  });
  if (!event) return null;

  const categories = await TicketCategory.findAll({
    where: { eventId: event.id },
    order: [['pricePaise', 'ASC']],
  });
  const organizer = (event as unknown as { Organizer: Organizer }).Organizer;

  return {
    id: event.id,
    slug: event.slug ?? event.id,
    name: event.name,
    tagline: event.tagline,
    description: event.description,
    eventDate: event.eventDate.toISOString(),
    venueAddress: event.venueAddress,
    venueMapUrl: event.venueMapUrl,
    bannerUrl: event.bannerUrl,
    termsAndConditions: event.termsAndConditions,
    cancellationPolicy: event.cancellationPolicy,
    scheduleItems: event.scheduleItems,
    packingChecklist: event.packingChecklist,
    faqItems: event.faqItems,
    organizerName: organizer.name,
    organizerSlug: organizer.slug,
    ticketCategories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      pricePaise: c.pricePaise,
      maxPerBooking: c.maxPerBooking,
      available: c.quotaRemaining,
    })),
  };
}
