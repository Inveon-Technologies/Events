import { QueryInterface } from 'sequelize';

// Index audit (#74): indexes for every hot lookup that had none.
// CONCURRENTLY so building them never blocks bookings on a live
// database (migrations run while the previous release is still serving
// — see scripts/deploy.sh); IF NOT EXISTS so a re-run is harmless.
const INDEXES: Array<{ name: string; sql: string }> = [
  // Every Cashfree webhook, and the pending-booking sweep, look up the
  // payment by its gateway order id.
  { name: 'payments_gateway_reference', sql: 'ON payments (gateway_reference) WHERE gateway_reference IS NOT NULL' },
  // Customer login / "My bookings" matches the email case-insensitively.
  { name: 'bookings_lower_primary_contact_email', sql: 'ON bookings (lower(primary_contact_email))' },
  // The unpaid-online-booking expiry sweep (runs every few minutes).
  { name: 'bookings_pending_online_created_at', sql: "ON bookings (created_at) WHERE status = 'pending' AND payment_method = 'online'" },
  // Public event listing, reminders and the next-day broadcast all
  // filter published events by date.
  { name: 'events_status_event_date', sql: 'ON events (status, event_date)' },
  // Organizer owner/team lookups.
  { name: 'users_organizer_id', sql: 'ON users (organizer_id)' },
  // Shared-file check when deleting media from a duplicated event.
  { name: 'event_media_url', sql: 'ON event_media (url)' },
];

export async function up({ context: qi }: { context: QueryInterface }) {
  for (const index of INDEXES) {
    // eslint-disable-next-line no-await-in-loop
    await qi.sequelize.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS ${index.name} ${index.sql}`);
  }
}

export async function down({ context: qi }: { context: QueryInterface }) {
  for (const index of [...INDEXES].reverse()) {
    // eslint-disable-next-line no-await-in-loop
    await qi.sequelize.query(`DROP INDEX CONCURRENTLY IF EXISTS ${index.name}`);
  }
}
