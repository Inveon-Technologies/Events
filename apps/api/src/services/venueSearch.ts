// OpenStreetMap's Nominatim is a free, public geocoder that needs no
// API key (unlike Google Places), which is why it's used here instead
// — this app has no Google Maps API credentials configured anywhere.
// Its usage policy requires a real identifying User-Agent and caps
// requests at 1/second; this is only ever called from an organizer
// typing into a search box (a few requests per minute at most), well
// within that limit, so no additional rate limiting is added here.
const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'InveonEvents/1.0 (office.inveontech@gmail.com)';

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    road?: string;
    suburb?: string;
    neighbourhood?: string;
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state?: string;
    postcode?: string;
  };
}

export interface VenueSearchResult {
  displayName: string;
  venueName: string;
  city: string;
  state: string;
  pincode: string;
  latitude: number;
  longitude: number;
}

export class VenueSearchError extends Error {}

// Real geocoding, not a hardcoded preset list or randomly generated
// coordinates — every result here is a genuine place Nominatim found,
// with its real coordinates and real address breakdown.
export async function searchVenues(query: string): Promise<VenueSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const url = `${NOMINATIM_BASE_URL}?${new URLSearchParams({
    q: trimmed,
    format: 'json',
    addressdetails: '1',
    limit: '5',
    countrycodes: 'in',
  })}`;

  let res: Response;
  try {
    res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  } catch {
    throw new VenueSearchError('Could not reach the location search service. Please try again.');
  }

  if (!res.ok) {
    throw new VenueSearchError('Could not reach the location search service. Please try again.');
  }

  const results = (await res.json()) as NominatimResult[];

  return results.map((r) => {
    const addr = r.address ?? {};
    const venueName = addr.road || r.display_name.split(',')[0].trim();
    return {
      displayName: r.display_name,
      venueName,
      city: addr.city || addr.town || addr.village || addr.suburb || '',
      state: addr.state || '',
      pincode: addr.postcode || '',
      latitude: parseFloat(r.lat),
      longitude: parseFloat(r.lon),
    };
  });
}

const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';

// The real address at a point the organizer clicked or dragged a pin to
// on the map. Returns null when OpenStreetMap has no address there
// (open water, remote terrain) — the point still saves with its
// coordinates; the organizer just types a label.
export async function reverseGeocode(latitude: number, longitude: number): Promise<VenueSearchResult | null> {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new VenueSearchError('Invalid coordinates');
  }

  const url = `${NOMINATIM_REVERSE_URL}?${new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    format: 'json',
    addressdetails: '1',
    zoom: '18',
  })}`;

  let res: Response;
  try {
    res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  } catch {
    throw new VenueSearchError('Could not reach the location search service. Please try again.');
  }
  if (!res.ok) {
    throw new VenueSearchError('Could not reach the location search service. Please try again.');
  }

  const result = (await res.json()) as NominatimResult & { error?: string };
  if (result.error || !result.display_name) return null;
  const addr = result.address ?? {};
  return {
    displayName: result.display_name,
    venueName: addr.road || result.display_name.split(',')[0].trim(),
    city: addr.city || addr.town || addr.village || addr.suburb || '',
    state: addr.state || '',
    pincode: addr.postcode || '',
    latitude,
    longitude,
  };
}
