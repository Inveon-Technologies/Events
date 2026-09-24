// The public event page's data, built only from the real backend.
import type { LocationPoint } from './mapPoints';

export interface TicketCategory {
  id: string;
  name: string;
  description: string;
  price: number;
  maxPerBooking: number;
  available: number;
}

export interface EventDetails {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  category: string;
  subCategory?: string;
  rating?: string;
  reviewsCount?: number;
  date: string;
  time: string;
  gatherTime: string;
  difficulty?: string;
  venue: string;
  locationCoords?: string;
  parkingInfo?: string;
  drivingInfo?: string;
  availableSeats: number;
  organizer: {
    slug: string;
    name: string;
    tagline: string;
    eventsHosted?: number;
    rating?: string;
  };
  galleryImages: {
    src: string;
    alt: string;
  }[];
  videoUrl?: string | null;
  about: string;
  aboutExtra?: string;
  highlights: {
    icon: string;
    title: string;
    desc: string;
  }[];
  included: string[];
  excluded: string[];
  schedule: {
    time: string;
    title: string;
    desc: string;
  }[];
  packingList: {
    icon: string;
    title: string;
    desc: string;
  }[];
  // The backend has no event leader concept yet, so real events never
  // have one and the page renders nothing for it.
  leader?: {
    name: string;
    role: string;
    bio: string;
    avatar: string;
  } | null;
  // null/undefined means "nothing to show",
  // handled by the page rendering nothing rather than a placeholder.
  cancellationPolicyText?: string | null;
  allowSelfServiceCancellation?: boolean;
  refundCutoffDays?: number | null;
  refundPercentage?: number | null;
  venueMapUrl?: string | null;
  genderRestriction?: 'male' | 'female' | null;
  faqItems?: { question: string; answer: string }[] | null;
  ratingSummary?: { averageRating: number | null; reviewCount: number };
  isPast?: boolean;
  ticketCategories: TicketCategory[];
  // Venue / pickup / drop pins, in the organizer's order. Falls back to a
  // single venue pin when only venue coordinates exist.
  locationPoints: LocationPoint[];
}

// fetchEventData() builds the event page's data purely from the real
// backend (GET /api/events/:eventId). It used to layer real fields onto
// getEventData()'s mock template, and fall back to the whole mock event
// whenever the request failed — so a mistyped link, a deleted event, or
// a brief API outage showed customers a fabricated "Rajgad" trek with
// bookable-looking tickets, and real events inherited a fake gallery,
// schedule, packing list, highlights, trek leader, and directions.
// Now: anything the organizer didn't provide is simply empty (the page
// hides that section), a missing event throws EventNotFoundError, and
// any other failure throws so the page can say so and offer a retry.
export class EventNotFoundError extends Error {}

export async function fetchEventData(eventId?: string): Promise<EventDetails> {
  if (!eventId) throw new EventNotFoundError('No event specified');

  const res = await fetch(`/api/events/${encodeURIComponent(eventId)}`);
  if (res.status === 404) throw new EventNotFoundError('Event not found');
  if (!res.ok) throw new Error(`Could not load this event (${res.status})`);
  const real = await res.json();

  const eventDate = new Date(real.eventDate);
  const dateStr = eventDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const timeStr = eventDate.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
  const gateOpen = real.gateOpenTime ? new Date(real.gateOpenTime) : null;

  const realMedia = Array.isArray(real.media) ? real.media : [];
  const realPhotos = realMedia.filter((m: { mediaType: string }) => m.mediaType === 'photo');
  const realVideo = realMedia.find((m: { mediaType: string }) => m.mediaType === 'video');
  const galleryImages = realPhotos.length > 0
    ? realPhotos.map((m: { url: string }) => ({ src: m.url, alt: real.name }))
    : real.bannerUrl
      ? [{ src: real.bannerUrl, alt: real.name }]
      : [];

  const ticketCategories = (real.ticketCategories ?? []).map(
    (tc: { id: string; name: string; description: string | null; pricePaise: number; maxPerBooking: number; available: number }) => ({
      id: tc.id,
      name: tc.name,
      description: tc.description || `₹${Math.round(tc.pricePaise / 100)} per ticket`,
      price: Math.round(tc.pricePaise / 100),
      maxPerBooking: tc.maxPerBooking,
      available: tc.available,
    }),
  );

  return {
    id: real.id,
    slug: real.slug ?? real.id,
    name: real.name,
    tagline: real.tagline || '',
    category: '',
    date: dateStr,
    time: timeStr,
    gatherTime: gateOpen
      ? gateOpen.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
      : '',
    venue: real.venueAddress || '',
    availableSeats: ticketCategories.reduce((sum: number, tc: { available: number }) => sum + tc.available, 0),
    organizer: {
      slug: real.organizerSlug,
      name: real.organizerName,
      tagline: '',
    },
    galleryImages,
    videoUrl: realVideo ? realVideo.url : null,
    about: real.description || '',
    highlights: [],
    included: [],
    excluded: [],
    schedule: Array.isArray(real.scheduleItems)
      ? real.scheduleItems.map((s: { time: string; title: string; description?: string }) => ({
          time: s.time,
          title: s.title,
          desc: s.description || '',
        }))
      : [],
    packingList: Array.isArray(real.packingChecklist)
      ? real.packingChecklist.map((p: { item: string; mandatory: boolean }) => ({
          icon: p.mandatory ? 'check_circle' : 'info',
          title: p.item,
          desc: p.mandatory ? 'Mandatory' : 'Optional',
        }))
      : [],
    leader: null,
    cancellationPolicyText: real.cancellationPolicy || null,
    allowSelfServiceCancellation: Boolean(real.allowSelfServiceCancellation),
    refundCutoffDays: real.refundCutoffDays ?? null,
    refundPercentage: real.refundPercentage ?? null,
    venueMapUrl: real.venueMapUrl || null,
    genderRestriction: real.genderRestriction || null,
    faqItems: Array.isArray(real.faqItems) && real.faqItems.length > 0 ? real.faqItems : null,
    ratingSummary: real.ratingSummary,
    isPast: eventDate.getTime() < Date.now(),
    ticketCategories,
    locationPoints: Array.isArray(real.locationPoints) && real.locationPoints.length > 0
      ? real.locationPoints
      : typeof real.venueLatitude === 'number' && typeof real.venueLongitude === 'number'
        ? [{
            type: 'venue',
            label: real.venueAddress?.split(',')[0] || real.name,
            address: real.venueAddress || null,
            latitude: real.venueLatitude,
            longitude: real.venueLongitude,
            time: null,
            note: null,
          }]
        : [],
  };
}
