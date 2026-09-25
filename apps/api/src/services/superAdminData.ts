import { QueryTypes, Op, WhereOptions } from 'sequelize';
import { sequelize } from '../db/connection';
import { Organizer, User, Event, BlockedCustomer, NotificationLog, AdminAuditLog } from '../models';
import { clearBlockCache } from './accountBlocks';

// Read side of the super admin portal: platform-wide numbers and lists
// across every organizer. Aggregates are plain SQL so a dashboard load is
// a handful of indexed queries, not thousands of rows through the ORM.

export class AdminNotFoundError extends Error {}
export class AdminValidationError extends Error {}

const PAGE_SIZE = 50;

export function pageOf(raw: unknown): { page: number; limit: number; offset: number } {
  const page = Math.max(1, Math.min(10_000, Number(raw) || 1));
  return { page, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE };
}

function likeTerm(q: unknown): string | null {
  const term = typeof q === 'string' ? q.trim().slice(0, 100) : '';
  return term ? `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
}

async function one<T extends object>(sql: string, replacements: Record<string, unknown> = {}): Promise<T> {
  const rows = await sequelize.query<T>(sql, { type: QueryTypes.SELECT, replacements });
  return rows[0];
}

async function many<T extends object>(sql: string, replacements: Record<string, unknown> = {}): Promise<T[]> {
  return sequelize.query<T>(sql, { type: QueryTypes.SELECT, replacements });
}

const platformFeePercent = () => Number(process.env.PLATFORM_FEE_PERCENT) || 0;

// ---------- dashboard ----------

export async function adminDashboard() {
  const totals = await one<Record<string, string | number | null>>(`
    SELECT
      (SELECT COUNT(*) FROM organizers) AS organizers,
      (SELECT COUNT(*) FROM organizers WHERE blocked_at IS NOT NULL) AS blocked_organizers,
      (SELECT COUNT(*) FROM users) AS organizer_users,
      (SELECT COUNT(*) FROM events) AS events,
      (SELECT COUNT(*) FROM events WHERE status = 'published' AND event_date >= NOW()) AS live_events,
      (SELECT COUNT(*) FROM bookings) AS bookings,
      (SELECT COUNT(*) FROM bookings WHERE status = 'confirmed') AS confirmed_bookings,
      (SELECT COUNT(*) FROM bookings WHERE status = 'pending') AS pending_bookings,
      (SELECT COUNT(*) FROM tickets WHERE status <> 'cancelled') AS tickets,
      (SELECT COUNT(*) FROM tickets WHERE status = 'checked_in') AS checked_in,
      (SELECT COUNT(DISTINCT LOWER(primary_contact_email)) FROM bookings) AS customers,
      (SELECT COUNT(*) FROM blocked_customers) AS blocked_customers,
      (SELECT COALESCE(SUM(amount_paise), 0) FROM payments WHERE status = 'paid') AS revenue_paise,
      (SELECT COALESCE(SUM(amount_paise), 0) FROM payments WHERE status = 'paid' AND method = 'online') AS online_revenue_paise,
      (SELECT COALESCE(SUM(refund_amount_paise), 0) FROM bookings WHERE refund_amount_paise IS NOT NULL) AS refunded_paise
  `);

  const windows = await one<Record<string, string | number>>(`
    SELECT
      COUNT(*) FILTER (WHERE b.created_at >= NOW() - INTERVAL '1 day') AS bookings_24h,
      COUNT(*) FILTER (WHERE b.created_at >= NOW() - INTERVAL '7 days') AS bookings_7d,
      COUNT(*) FILTER (WHERE b.created_at >= NOW() - INTERVAL '30 days') AS bookings_30d,
      COALESCE(SUM(p.amount_paise) FILTER (WHERE p.status = 'paid' AND b.created_at >= NOW() - INTERVAL '1 day'), 0) AS revenue_24h,
      COALESCE(SUM(p.amount_paise) FILTER (WHERE p.status = 'paid' AND b.created_at >= NOW() - INTERVAL '7 days'), 0) AS revenue_7d,
      COALESCE(SUM(p.amount_paise) FILTER (WHERE p.status = 'paid' AND b.created_at >= NOW() - INTERVAL '30 days'), 0) AS revenue_30d
    FROM bookings b LEFT JOIN payments p ON p.booking_id = b.id
  `);

  const daily = await many<{ day: string; bookings: string; revenue_paise: string }>(`
    SELECT TO_CHAR(d.day, 'YYYY-MM-DD') AS day,
           COUNT(b.id) AS bookings,
           COALESCE(SUM(p.amount_paise) FILTER (WHERE p.status = 'paid'), 0) AS revenue_paise
    FROM generate_series((NOW() AT TIME ZONE 'Asia/Kolkata')::date - 29, (NOW() AT TIME ZONE 'Asia/Kolkata')::date, INTERVAL '1 day') AS d(day)
    LEFT JOIN bookings b ON (b.created_at AT TIME ZONE 'Asia/Kolkata')::date = d.day::date
    LEFT JOIN payments p ON p.booking_id = b.id
    GROUP BY d.day ORDER BY d.day
  `);

  const topEvents = await many<Record<string, unknown>>(`
    SELECT e.id, e.name, o.name AS organizer_name, e.event_date,
           COUNT(DISTINCT b.id) FILTER (WHERE b.status = 'confirmed') AS bookings,
           COALESCE(SUM(p.amount_paise) FILTER (WHERE p.status = 'paid'), 0) AS revenue_paise
    FROM events e
    JOIN organizers o ON o.id = e.organizer_id
    LEFT JOIN bookings b ON b.event_id = e.id
    LEFT JOIN payments p ON p.booking_id = b.id
    GROUP BY e.id, o.name
    ORDER BY revenue_paise DESC, bookings DESC
    LIMIT 5
  `);

  const recentBookings = await many<Record<string, unknown>>(`
    SELECT b.booking_reference, b.primary_contact_name, b.status, b.total_amount_paise, b.payment_method, b.created_at,
           e.name AS event_name
    FROM bookings b JOIN events e ON e.id = b.event_id
    ORDER BY b.created_at DESC LIMIT 8
  `);

  const notifications24h = await many<{ channel: string; status: string; count: string }>(`
    SELECT channel, status, COUNT(*) AS count FROM notification_logs
    WHERE created_at >= NOW() - INTERVAL '1 day' GROUP BY channel, status
  `);

  const num = (v: unknown) => Number(v ?? 0);
  const revenue = num(totals.revenue_paise);
  return {
    totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, num(v)])),
    windows: Object.fromEntries(Object.entries(windows).map(([k, v]) => [k, num(v)])),
    platformFeePercent: platformFeePercent(),
    platformEarningsPaise: Math.round((num(totals.online_revenue_paise) * platformFeePercent()) / 100),
    grossRevenuePaise: revenue,
    daily: daily.map((d) => ({ day: d.day, bookings: num(d.bookings), revenuePaise: num(d.revenue_paise) })),
    topEvents: topEvents.map((e) => ({ ...e, bookings: num(e.bookings), revenue_paise: num(e.revenue_paise) })),
    recentBookings,
    notifications24h: notifications24h.map((n) => ({ ...n, count: num(n.count) })),
  };
}

// ---------- organizers & their users ----------

export async function listOrganizers(query: { q?: unknown; status?: unknown; page?: unknown }) {
  const { page, limit, offset } = pageOf(query.page);
  const term = likeTerm(query.q);
  const conditions: string[] = [];
  if (term) conditions.push(`(o.name ILIKE :term OR o.slug ILIKE :term OR o.contact_email ILIKE :term OR o.contact_phone ILIKE :term)`);
  if (query.status === 'blocked') conditions.push('o.blocked_at IS NOT NULL');
  if (query.status === 'active') conditions.push('o.blocked_at IS NULL');
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await many<Record<string, unknown>>(
    `SELECT o.id, o.name, o.slug, o.contact_email, o.contact_phone, o.logo_url, o.cashfree_vendor_status, o.kyc_submitted_at,
            o.blocked_at, o.blocked_reason, o.created_at,
            (SELECT COUNT(*) FROM users u WHERE u.organizer_id = o.id) AS users,
            (SELECT COUNT(*) FROM events e WHERE e.organizer_id = o.id) AS events,
            (SELECT COUNT(*) FROM bookings b JOIN events e ON e.id = b.event_id WHERE e.organizer_id = o.id AND b.status = 'confirmed') AS bookings,
            (SELECT COALESCE(SUM(p.amount_paise), 0) FROM payments p JOIN bookings b ON b.id = p.booking_id JOIN events e ON e.id = b.event_id
               WHERE e.organizer_id = o.id AND p.status = 'paid') AS revenue_paise
     FROM organizers o ${where}
     ORDER BY o.created_at DESC LIMIT :limit OFFSET :offset`,
    { term, limit, offset },
  );
  const total = await one<{ count: string }>(`SELECT COUNT(*) AS count FROM organizers o ${where}`, { term });
  return {
    organizers: rows.map((r) => ({
      ...r,
      users: Number(r.users),
      events: Number(r.events),
      bookings: Number(r.bookings),
      revenue_paise: Number(r.revenue_paise),
    })),
    page,
    pageSize: limit,
    total: Number(total.count),
  };
}

export async function organizerDetail(id: string) {
  const organizer = await Organizer.findByPk(id);
  if (!organizer) throw new AdminNotFoundError('Organizer not found');
  const users = await User.findAll({
    where: { organizerId: id },
    attributes: ['id', 'email', 'name', 'role', 'emailVerified', 'blockedAt', 'blockedReason', 'createdAt'],
    order: [['createdAt', 'ASC']],
  });
  const events = await many<Record<string, unknown>>(
    `SELECT e.id, e.name, e.status, e.event_date,
            (SELECT COUNT(*) FROM bookings b WHERE b.event_id = e.id AND b.status = 'confirmed') AS bookings,
            (SELECT COALESCE(SUM(p.amount_paise), 0) FROM payments p JOIN bookings b ON b.id = p.booking_id
               WHERE b.event_id = e.id AND p.status = 'paid') AS revenue_paise
     FROM events e WHERE e.organizer_id = :id ORDER BY e.event_date DESC LIMIT 200`,
    { id },
  );
  const o = organizer.toJSON() as unknown as Record<string, unknown>;
  // Bank/KYC numbers stay masked, as in the organizer's own view.
  return {
    organizer: { ...o, panNumber: organizer.panNumber ? `••••••${organizer.panNumber.slice(-4)}` : null },
    users,
    events: events.map((e) => ({ ...e, bookings: Number(e.bookings), revenue_paise: Number(e.revenue_paise) })),
  };
}

export { isCustomerBlocked } from './accountBlocks';

export async function setOrganizerBlocked(id: string, blocked: boolean, reason: string | null) {
  const organizer = await Organizer.findByPk(id);
  if (!organizer) throw new AdminNotFoundError('Organizer not found');
  await organizer.update({ blockedAt: blocked ? new Date() : null, blockedReason: blocked ? reason : null });
  clearBlockCache();
  return organizer;
}

export async function setUserBlocked(id: string, blocked: boolean, reason: string | null) {
  const user = await User.findByPk(id);
  if (!user) throw new AdminNotFoundError('User not found');
  await user.update({ blockedAt: blocked ? new Date() : null, blockedReason: blocked ? reason : null });
  clearBlockCache();
  return user;
}

// ---------- customers ----------

export async function listCustomers(query: { q?: unknown; status?: unknown; page?: unknown }) {
  const { page, limit, offset } = pageOf(query.page);
  const term = likeTerm(query.q);
  const where = term
    ? `WHERE (b.primary_contact_email ILIKE :term OR b.primary_contact_name ILIKE :term OR b.primary_contact_whatsapp ILIKE :term)`
    : '';
  const rows = await many<Record<string, unknown>>(
    `SELECT LOWER(b.primary_contact_email) AS email,
            MAX(b.primary_contact_name) AS name,
            MAX(b.primary_contact_whatsapp) AS phone,
            MAX(b.primary_contact_city) AS city,
            COUNT(*) AS bookings,
            COUNT(*) FILTER (WHERE b.status = 'confirmed') AS confirmed,
            COALESCE(SUM(b.total_amount_paise) FILTER (WHERE b.status = 'confirmed'), 0) AS spent_paise,
            MIN(b.created_at) AS first_booking_at,
            MAX(b.created_at) AS last_booking_at,
            MAX(bc.reason) AS blocked_reason,
            BOOL_OR(bc.email IS NOT NULL) AS blocked
     FROM bookings b LEFT JOIN blocked_customers bc ON bc.email = LOWER(b.primary_contact_email)
     ${where}
     GROUP BY LOWER(b.primary_contact_email)
     ${query.status === 'blocked' ? 'HAVING BOOL_OR(bc.email IS NOT NULL)' : ''}
     ORDER BY MAX(b.created_at) DESC LIMIT :limit OFFSET :offset`,
    { term, limit, offset },
  );
  const total = await one<{ count: string }>(`SELECT COUNT(DISTINCT LOWER(b.primary_contact_email)) AS count FROM bookings b ${where}`, {
    term,
  });
  return {
    customers: rows.map((r) => ({
      ...r,
      bookings: Number(r.bookings),
      confirmed: Number(r.confirmed),
      spent_paise: Number(r.spent_paise),
    })),
    page,
    pageSize: limit,
    total: Number(total.count),
  };
}

export async function blockCustomer(emailRaw: string, reason: string | null, by: string) {
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new AdminValidationError('Enter a valid email');
  await BlockedCustomer.upsert({ email, reason, blockedBy: by });
}

export async function unblockCustomer(emailRaw: string) {
  await BlockedCustomer.destroy({ where: { email: emailRaw.trim().toLowerCase() } });
}

// ---------- events, bookings, payments ----------

export async function listEvents(query: { q?: unknown; status?: unknown; page?: unknown }) {
  const { page, limit, offset } = pageOf(query.page);
  const term = likeTerm(query.q);
  const conditions: string[] = [];
  if (term) conditions.push('(e.name ILIKE :term OR o.name ILIKE :term)');
  if (typeof query.status === 'string' && ['draft', 'published', 'closed', 'cancelled'].includes(query.status))
    conditions.push('e.status = :status');
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await many<Record<string, unknown>>(
    `SELECT e.id, e.name, e.slug, e.status, e.event_date, e.venue_address, e.certificate_enabled, o.id AS organizer_id, o.name AS organizer_name,
            (SELECT COALESCE(SUM(tc.quota_total), 0) FROM ticket_categories tc WHERE tc.event_id = e.id) AS capacity,
            (SELECT COUNT(*) FROM tickets t JOIN bookings b ON b.id = t.booking_id WHERE b.event_id = e.id AND t.status <> 'cancelled' AND b.status = 'confirmed') AS tickets_sold,
            (SELECT COUNT(*) FROM tickets t JOIN bookings b ON b.id = t.booking_id WHERE b.event_id = e.id AND t.status = 'checked_in') AS checked_in,
            (SELECT COALESCE(SUM(p.amount_paise), 0) FROM payments p JOIN bookings b ON b.id = p.booking_id WHERE b.event_id = e.id AND p.status = 'paid') AS revenue_paise
     FROM events e JOIN organizers o ON o.id = e.organizer_id ${where}
     ORDER BY e.event_date DESC LIMIT :limit OFFSET :offset`,
    { term, status: query.status, limit, offset },
  );
  const total = await one<{ count: string }>(`SELECT COUNT(*) AS count FROM events e JOIN organizers o ON o.id = e.organizer_id ${where}`, {
    term,
    status: query.status,
  });
  const n = (v: unknown) => Number(v ?? 0);
  return {
    events: rows.map((r) => ({
      ...r,
      capacity: n(r.capacity),
      tickets_sold: n(r.tickets_sold),
      checked_in: n(r.checked_in),
      revenue_paise: n(r.revenue_paise),
    })),
    page,
    pageSize: limit,
    total: Number(total.count),
  };
}

export async function setEventStatus(id: string, status: 'published' | 'closed') {
  const event = await Event.findByPk(id);
  if (!event) throw new AdminNotFoundError('Event not found');
  await event.update({ status });
  return event;
}

export async function listBookings(query: { q?: unknown; status?: unknown; page?: unknown }) {
  const { page, limit, offset } = pageOf(query.page);
  const term = likeTerm(query.q);
  const conditions: string[] = [];
  if (term)
    conditions.push(
      '(b.booking_reference ILIKE :term OR b.primary_contact_email ILIKE :term OR b.primary_contact_name ILIKE :term OR b.primary_contact_whatsapp ILIKE :term OR e.name ILIKE :term)',
    );
  if (typeof query.status === 'string' && ['pending', 'confirmed', 'cancelled'].includes(query.status))
    conditions.push('b.status = :status');
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await many<Record<string, unknown>>(
    `SELECT b.id, b.booking_reference, b.status, b.payment_method, b.total_amount_paise, b.primary_contact_name, b.primary_contact_email,
            b.primary_contact_whatsapp, b.refund_amount_paise, b.refund_status, b.confirmation_email_status, b.confirmation_whatsapp_status,
            b.created_at, e.name AS event_name, o.name AS organizer_name,
            (SELECT COUNT(*) FROM tickets t WHERE t.booking_id = b.id) AS tickets
     FROM bookings b JOIN events e ON e.id = b.event_id JOIN organizers o ON o.id = e.organizer_id ${where}
     ORDER BY b.created_at DESC LIMIT :limit OFFSET :offset`,
    { term, status: query.status, limit, offset },
  );
  const total = await one<{ count: string }>(`SELECT COUNT(*) AS count FROM bookings b JOIN events e ON e.id = b.event_id ${where}`, {
    term,
    status: query.status,
  });
  return { bookings: rows.map((r) => ({ ...r, tickets: Number(r.tickets) })), page, pageSize: limit, total: Number(total.count) };
}

export async function listPayments(query: { q?: unknown; status?: unknown; method?: unknown; page?: unknown }) {
  const { page, limit, offset } = pageOf(query.page);
  const term = likeTerm(query.q);
  const conditions: string[] = [];
  if (term)
    conditions.push(
      '(b.booking_reference ILIKE :term OR p.gateway_reference ILIKE :term OR b.primary_contact_email ILIKE :term OR e.name ILIKE :term)',
    );
  if (typeof query.status === 'string' && ['pending', 'paid', 'failed', 'refunded'].includes(query.status))
    conditions.push('p.status = :status');
  if (query.method === 'online' || query.method === 'cash') conditions.push('p.method = :method');
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const from = `FROM payments p JOIN bookings b ON b.id = p.booking_id JOIN events e ON e.id = b.event_id JOIN organizers o ON o.id = e.organizer_id ${where}`;
  const rows = await many<Record<string, unknown>>(
    `SELECT p.id, p.amount_paise, p.method, p.status, p.gateway_reference, p.verified_at, p.created_at,
            b.booking_reference, b.primary_contact_name, b.primary_contact_email, b.refund_amount_paise, b.refund_status,
            e.name AS event_name, o.name AS organizer_name
     ${from} ORDER BY p.created_at DESC LIMIT :limit OFFSET :offset`,
    { term, status: query.status, method: query.method, limit, offset },
  );
  const summary = await one<Record<string, string>>(
    `SELECT COUNT(*) AS count,
            COALESCE(SUM(p.amount_paise) FILTER (WHERE p.status = 'paid'), 0) AS paid_paise,
            COALESCE(SUM(p.amount_paise) FILTER (WHERE p.status = 'pending'), 0) AS pending_paise,
            COALESCE(SUM(p.amount_paise) FILTER (WHERE p.status = 'failed'), 0) AS failed_paise,
            COALESCE(SUM(b.refund_amount_paise) FILTER (WHERE b.refund_amount_paise IS NOT NULL), 0) AS refunded_paise
     ${from}`,
    { term, status: query.status, method: query.method },
  );
  return {
    payments: rows,
    summary: Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, Number(v)])),
    page,
    pageSize: limit,
    total: Number(summary.count),
  };
}

// ---------- notification & audit logs ----------

export async function listNotifications(query: { channel?: unknown; status?: unknown; q?: unknown; page?: unknown }) {
  const { page, limit, offset } = pageOf(query.page);
  const where: WhereOptions = {};
  if (typeof query.channel === 'string' && ['email', 'whatsapp', 'otp'].includes(query.channel))
    Object.assign(where, { channel: query.channel });
  if (typeof query.status === 'string' && query.status) Object.assign(where, { status: query.status.slice(0, 20) });
  const term = likeTerm(query.q);
  if (term)
    Object.assign(where, {
      [Op.or]: [{ recipient: { [Op.iLike]: term } }, { subject: { [Op.iLike]: term } }, { kind: { [Op.iLike]: term } }],
    });
  const { rows, count } = await NotificationLog.findAndCountAll({ where, order: [['createdAt', 'DESC']], limit, offset });
  const summary = await many<{ channel: string; status: string; count: string }>(
    `SELECT channel, status, COUNT(*) AS count FROM notification_logs WHERE created_at >= NOW() - INTERVAL '1 day' GROUP BY channel, status`,
  );
  return { logs: rows, page, pageSize: limit, total: count, last24h: summary.map((s) => ({ ...s, count: Number(s.count) })) };
}

export async function listAudit(query: { q?: unknown; page?: unknown }) {
  const { page, limit, offset } = pageOf(query.page);
  const term = likeTerm(query.q);
  const where: WhereOptions = term
    ? { [Op.or]: [{ action: { [Op.iLike]: term } }, { target: { [Op.iLike]: term } }, { adminEmail: { [Op.iLike]: term } }] }
    : {};
  const { rows, count } = await AdminAuditLog.findAndCountAll({ where, order: [['createdAt', 'DESC']], limit, offset });
  return { logs: rows, page, pageSize: limit, total: count };
}

// Deletes old rows from the portal's own logs (the audit log keeps at
// least 90 days regardless).
export async function purgeLogs(olderThanDays: number): Promise<{ notifications: number; audit: number }> {
  const days = Math.max(7, Math.min(3650, Math.floor(olderThanDays)));
  const cutoff = new Date(Date.now() - days * 86400_000);
  const notifications = await NotificationLog.destroy({ where: { createdAt: { [Op.lt]: cutoff } } });
  const auditCutoff = new Date(Date.now() - Math.max(days, 90) * 86400_000);
  const audit = await AdminAuditLog.destroy({ where: { createdAt: { [Op.lt]: auditCutoff } } });
  return { notifications, audit };
}
