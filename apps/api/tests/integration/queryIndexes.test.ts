import { QueryTypes } from 'sequelize';
import { sequelize } from '../../src/db/connection';

// Index audit (#74). Test tables are tiny, so the planner would happily
// seq-scan them; disabling seq scans makes it use an index if — and only
// if — a suitable one exists. Each query mirrors the app's real one.
async function planFor(sql: string): Promise<string> {
  return sequelize.transaction(async (t) => {
    await sequelize.query('SET LOCAL enable_seqscan = off', { transaction: t });
    const rows = await sequelize.query<{ 'QUERY PLAN': string }>(`EXPLAIN ${sql}`, { type: QueryTypes.SELECT, transaction: t });
    return rows.map((r) => r['QUERY PLAN']).join('\n');
  });
}

describe('query indexes (real Postgres planner)', () => {
  afterAll(async () => {
    await sequelize.close();
  });

  it.each([
    [
      'payment webhook lookup by gateway order id',
      "SELECT * FROM payments WHERE gateway_reference = 'INV-BKG-2026-X'",
      'payments_gateway_reference',
    ],
    [
      'customer "My bookings" by email (case-insensitive)',
      "SELECT * FROM bookings WHERE lower(primary_contact_email) = 'a@example.com'",
      'bookings_lower_primary_contact_email',
    ],
    [
      'unpaid online booking sweep',
      "SELECT * FROM bookings WHERE status = 'pending' AND payment_method = 'online' AND created_at < now() ORDER BY created_at LIMIT 200",
      'bookings_pending_online_created_at',
    ],
    [
      'public events list / reminders',
      "SELECT * FROM events WHERE status = 'published' AND event_date >= now()",
      'events_status_event_date',
    ],
    ['QR check-in', "SELECT * FROM tickets WHERE qr_token = 'x'", 'qr_token'],
    ['booking by reference', "SELECT * FROM bookings WHERE booking_reference = 'x'", 'booking_reference'],
    ['organizer team lookup', "SELECT * FROM users WHERE organizer_id = '00000000-0000-0000-0000-000000000000'", 'users_organizer_id'],
    ['tickets of a booking', "SELECT * FROM tickets WHERE booking_id = '00000000-0000-0000-0000-000000000000'", 'booking_id'],
    ['organizer events', "SELECT * FROM events WHERE organizer_id = '00000000-0000-0000-0000-000000000000'", 'organizer_id'],
  ])('%s uses an index', async (_label, sql, indexFragment) => {
    const plan = await planFor(sql);
    expect(plan).not.toMatch(/Seq Scan/);
    expect(plan).toContain(indexFragment);
  });
});
