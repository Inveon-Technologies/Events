import { QueryInterface } from 'sequelize';

// The My Events mockup has four event states: Draft, Published, Completed,
// Cancelled. draft/published already exist. 'Completed' is deliberately NOT
// added here — an organizer doesn't manually mark an event completed, it's
// just a published event whose date has passed, so it's derived in the
// query layer (same reasoning as bookings' partially_cancelled status).
// 'Cancelled' IS a real organizer-initiated action, so it's a stored value.
export async function up({ context: qi }: { context: QueryInterface }) {
  await qi.sequelize.query("ALTER TYPE enum_events_status ADD VALUE IF NOT EXISTS 'cancelled';");
}

export async function down() {
  // Same reasoning as 00002: Postgres can't drop a single enum value
  // without rebuilding the type, so this is a no-op. Safe because up() is
  // idempotent (IF NOT EXISTS).
}
