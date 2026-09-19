import { Op } from 'sequelize';
import { Organizer, Event, TicketCategory } from '../models';

export interface PublicEventSummary {
  id: string;
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
  name: string;
  tagline: string | null;
  description: string | null;
  eventDate: string;
  venueAddress: string | null;
  venueMapUrl: string | null;
  bannerUrl: string | null;
  termsAndConditions: string | null;
  cancellationPolicy: string | null;
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

export async function getPublicEvent(eventId: string): Promise<PublicEventDetail | null> {
  const event = await Event.findOne({
    where: { id: eventId, status: 'published' },
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
    name: event.name,
    tagline: event.tagline,
    description: event.description,
    eventDate: event.eventDate.toISOString(),
    venueAddress: event.venueAddress,
    venueMapUrl: event.venueMapUrl,
    bannerUrl: event.bannerUrl,
    termsAndConditions: event.termsAndConditions,
    cancellationPolicy: event.cancellationPolicy,
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
