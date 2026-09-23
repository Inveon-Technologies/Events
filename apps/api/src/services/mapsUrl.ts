// Google's documented address-search URL format — no API key, no
// geocoding step required, works directly from the free-text venue
// address every event already has. If the organizer has pasted their
// own, more precise map link (event.venueMapUrl), that's used instead;
// this is only the fallback so a map link is never simply absent.
export function buildVenueMapUrl(venueAddress: string | null, venueMapUrl: string | null): string | null {
  if (venueMapUrl?.trim()) return venueMapUrl.trim();
  if (!venueAddress?.trim()) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venueAddress.trim())}`;
}
