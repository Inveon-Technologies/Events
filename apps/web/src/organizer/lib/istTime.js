// Event times are India time everywhere in the portal, whatever timezone
// the organizer's browser is in. (Slicing the ISO string showed UTC, which
// is 5h30m behind.)
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

// ISO timestamp / Date -> { date: 'YYYY-MM-DD', time: 'HH:MM' } in IST.
export function istParts(value) {
  const shifted = new Date(new Date(value).getTime() + IST_OFFSET_MS).toISOString();
  return { date: shifted.slice(0, 10), time: shifted.slice(11, 16) };
}
