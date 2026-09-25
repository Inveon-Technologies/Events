// Organizers enter event dates and times as India time, and the site
// shows them in India time. The server (a UTC container) must therefore
// never parse "2026-12-25T06:30" in its own timezone: that stored events
// 5h30m late, so customers saw 12:00 PM for a 6:30 AM start and the
// 3-hour reminder went out after the event had begun.

const IST_OFFSET = '+05:30';
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

// "2026-12-25" + "06:30" (India time) -> the exact instant.
export function parseIstDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00${IST_OFFSET}`);
}

// The instant -> { date: "2026-12-25", time: "06:30" } in India time.
export function istParts(instant: Date): { date: string; time: string } {
  const shifted = new Date(instant.getTime() + IST_OFFSET_MS).toISOString();
  return { date: shifted.slice(0, 10), time: shifted.slice(11, 16) };
}
