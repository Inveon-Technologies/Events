export interface DiscoverEvent {
  id: string;
  name: string;
  organizer: string;
  organizerSlug: string;
  date: string;
  location: string;
  price: number;
  category: string;
  image: string;
}

export interface ApiEventSummary {
  id: string;
  slug: string;
  name: string;
  eventDate: string;
  venueAddress: string | null;
  bannerUrl: string | null;
  organizerName: string;
  organizerSlug: string;
  minPricePaise: number | null;
}

const PLACEHOLDER_IMAGE = 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=800&q=80';

// Maps GET /api/events (see apps/api/src/services/publicEvents.ts) onto
// the shape event-listing pages already render against. id is the
// event's slug, not its database id — every link built from this list
// should resolve to the clean /events/<slug> URL, not a raw UUID.
// category isn't tracked by this schema yet, so real events don't
// currently match any category filter besides "All" — an honest gap,
// not filled in with a guess.
export function apiEventToDiscoverShape(e: ApiEventSummary): DiscoverEvent {
  return {
    id: e.slug,
    name: e.name,
    organizer: `By ${e.organizerName}`,
    organizerSlug: e.organizerSlug,
    date: new Date(e.eventDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
    location: e.venueAddress || 'Venue to be announced',
    price: e.minPricePaise != null ? Math.round(e.minPricePaise / 100) : 0,
    category: '',
    image: e.bannerUrl || PLACEHOLDER_IMAGE,
  };
}

export async function fetchDiscoverEvents(): Promise<DiscoverEvent[]> {
  const res = await fetch('/api/events');
  if (!res.ok) throw new Error('Failed to load events');
  const data = await res.json();
  return (data.events as ApiEventSummary[]).map(apiEventToDiscoverShape);
}
