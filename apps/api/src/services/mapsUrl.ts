// Google's documented URL formats — no API key needed for either. If
// the organizer has pasted their own, more precise map link
// (event.venueMapUrl), that's used first. Next preference is real
// coordinates from the venue search (services/venueSearch.ts) via
// Google's coordinate query format, which is unambiguous in a way a
// text search can occasionally not be (two venues sharing a name in
// different cities, for instance). Falling back to the address-search
// format when neither is available means a map link is still never
// simply absent as long as some address text exists.
export function buildVenueMapUrl(
  venueAddress: string | null,
  venueMapUrl: string | null,
  latitude?: number | null,
  longitude?: number | null,
): string | null {
  if (venueMapUrl?.trim()) return venueMapUrl.trim();
  if (latitude !== undefined && latitude !== null && longitude !== undefined && longitude !== null) {
    return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  }
  if (!venueAddress?.trim()) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venueAddress.trim())}`;
}
