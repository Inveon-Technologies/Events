import { Op, QueryTypes, Transaction } from 'sequelize';
import { sequelize } from '../db/connection';
import { Ticket } from '../models';

// Cancels every not-yet-cancelled ticket on a booking and returns
// exactly that many to its ticket category's quota. Counting the rows
// this UPDATE actually changed (rather than every ticket on the
// booking) is what makes a repeated call a no-op: tickets already
// cancelled by an earlier call are never released twice.
//
// Callers must run this in the same transaction as the booking's own
// status transition, and only after that transition succeeded.
export async function releaseBookingTickets(bookingId: string, transaction: Transaction): Promise<number> {
  const released = await sequelize.query<{ ticket_category_id: string }>(
    `UPDATE tickets SET status = 'cancelled', updated_at = NOW()
     WHERE booking_id = :bookingId AND status <> 'cancelled'
     RETURNING ticket_category_id`,
    { replacements: { bookingId }, type: QueryTypes.SELECT, transaction },
  );

  const countByCategory = new Map<string, number>();
  for (const row of released) {
    countByCategory.set(row.ticket_category_id, (countByCategory.get(row.ticket_category_id) ?? 0) + 1);
  }
  for (const [categoryId, qty] of countByCategory) {
    // eslint-disable-next-line no-await-in-loop
    await sequelize.query(
      `UPDATE ticket_categories SET quota_remaining = quota_remaining + :qty, updated_at = NOW() WHERE id = :id`,
      { replacements: { qty, id: categoryId }, transaction },
    );
  }
  return released.length;
}

// The reverse, for a booking being reinstated (a payment that arrived
// after its booking had already been released). Re-reserves with the
// same atomic conditional decrement as bookingCreation.ts, so it can
// never oversell: returns false, changing nothing, if any category no
// longer has enough stock.
export async function reserveBookingTickets(bookingId: string, transaction: Transaction): Promise<boolean> {
  const tickets = await Ticket.findAll({ where: { bookingId, status: 'cancelled' }, transaction });
  if (tickets.length === 0) return true;

  const countByCategory = new Map<string, number>();
  for (const ticket of tickets) {
    countByCategory.set(ticket.ticketCategoryId, (countByCategory.get(ticket.ticketCategoryId) ?? 0) + 1);
  }
  for (const [categoryId, qty] of countByCategory) {
    // eslint-disable-next-line no-await-in-loop
    const updated = await sequelize.query(
      `UPDATE ticket_categories SET quota_remaining = quota_remaining - :qty, updated_at = NOW()
       WHERE id = :id AND quota_remaining >= :qty RETURNING id`,
      { replacements: { qty, id: categoryId }, type: QueryTypes.SELECT, transaction },
    );
    if (updated.length === 0) return false;
  }

  await Ticket.update(
    { status: 'valid' },
    { where: { bookingId, status: 'cancelled', id: { [Op.in]: tickets.map((t) => t.id) } }, transaction },
  );
  return true;
}
