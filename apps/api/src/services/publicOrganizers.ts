import { Op } from 'sequelize';
import { Organizer, User, Event, TicketCategory } from '../models';

export interface PublicOrganizerSummary {
  slug: string;
  name: string;
  logoUrl: string | null;
  about: string | null;
  publishedEventCount: number;
}

export interface PublicOrganizerEvent {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  eventDate: string;
  venueAddress: string | null;
  bannerUrl: string | null;
  minPricePaise: number | null;
}

export interface PublicOrganizerDetail {
  slug: string;
  name: string;
  logoUrl: string | null;
  about: string | null;
  contactEmail: string | null;
  events: PublicOrganizerEvent[];
}

// "Verified" here means the organizer has at least one user who has
// actually completed email/OTP verification (see routes/auth.ts's
// verify-otp) — an organizer stuck mid-signup with an unverified owner
// shouldn't show up in a public directory implying they're a real,
// reachable organization.
export async function listPublicOrganizers(): Promise<PublicOrganizerSummary[]> {
  // Two steps rather than one join-and-filter query: an organizer with
  // multiple verified users would come back as duplicate rows from a
  // direct INNER JOIN on a hasMany association — get the distinct
  // matching ids first, then fetch those organizers cleanly.
  const verifiedUsers = await User.findAll({
    where: { emailVerified: true, organizerId: { [Op.ne]: null } },
    attributes: ['organizerId'],
    group: ['organizerId'],
  });
  const verifiedOrganizerIds = verifiedUsers.map((u) => u.organizerId).filter((id): id is string => Boolean(id));

  const organizers = await Organizer.findAll({
    where: { id: { [Op.in]: verifiedOrganizerIds } },
    order: [['name', 'ASC']],
  });

  return Promise.all(
    organizers.map(async (organizer) => {
      const publishedEventCount = await Event.count({
        where: { organizerId: organizer.id, status: 'published' },
      });
      return {
        slug: organizer.slug,
        name: organizer.name,
        logoUrl: organizer.logoUrl,
        about: organizer.about,
        publishedEventCount,
      };
    }),
  );
}

export async function getPublicOrganizer(slug: string): Promise<PublicOrganizerDetail | null> {
  const organizer = await Organizer.findOne({
    where: { slug },
    include: [{ model: User, where: { emailVerified: true }, attributes: [] }],
  });
  if (!organizer) return null;

  const events = await Event.findAll({
    where: { organizerId: organizer.id, status: 'published', eventDate: { [Op.gte]: new Date() } },
    order: [['eventDate', 'ASC']],
  });

  const eventDetails = await Promise.all(
    events.map(async (event) => {
      const cheapest = await TicketCategory.findOne({
        where: { eventId: event.id },
        order: [['pricePaise', 'ASC']],
      });
      return {
        id: event.id,
        slug: event.slug ?? event.id,
        name: event.name,
        tagline: event.tagline,
        eventDate: event.eventDate.toISOString(),
        venueAddress: event.venueAddress,
        bannerUrl: event.bannerUrl,
        minPricePaise: cheapest?.pricePaise ?? null,
      };
    }),
  );

  return {
    slug: organizer.slug,
    name: organizer.name,
    logoUrl: organizer.logoUrl,
    about: organizer.about,
    contactEmail: organizer.contactEmail,
    events: eventDetails,
  };
}
