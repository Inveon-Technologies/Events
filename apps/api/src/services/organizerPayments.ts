import { Organizer, Event, Booking, Payment } from '../models';

export interface OrganizerTransactionRow {
  id: string;
  createdAt: string;
  customerName: string;
  eventName: string;
  amountPaise: number;
  netAmountPaise: number;
  method: 'online' | 'cash';
  status: string;
}

export interface OrganizerPaymentsSummary {
  totalRevenuePaise: number;
  refundedAmountPaise: number;
  netPaise: number;
  platformFeePercent: number;
}

export interface OrganizerPaymentsResult {
  summary: OrganizerPaymentsSummary;
  transactions: OrganizerTransactionRow[];
  bankAccountHolderName: string | null;
  bankAccountNumberLast4: string | null;
  bankIfsc: string | null;
  payoutActive: boolean;
}

// Real revenue and refunds across every one of the organizer's events,
// not per-event — the previous page (Payments.jsx) read entirely from
// mock data (data/mockPayments.js) with no backend behind it at all,
// including a "payout batches" section referencing bank transfer
// details this system has no real access to (no Cashfree Settlements
// API integration exists). Rather than invent that, this returns only
// what's actually real: paid/refunded totals from actual Payment rows,
// and the organizer's own real linked bank account (same source as
// getEventFinancials) — no fabricated settlement batch history.
export async function getOrganizerPayments(organizerId: string): Promise<OrganizerPaymentsResult> {
  const [organizer, events] = await Promise.all([
    Organizer.findByPk(organizerId),
    Event.findAll({ where: { organizerId }, attributes: ['id', 'name'] }),
  ]);
  const eventIds = events.map((e) => e.id);
  const eventNameById = new Map(events.map((e) => [e.id, e.name]));

  const bookings = await Booking.findAll({ where: { eventId: eventIds } });
  const bookingById = new Map(bookings.map((b) => [b.id, b]));
  const bookingIds = bookings.map((b) => b.id);

  const payments = bookingIds.length
    ? await Payment.findAll({ where: { bookingId: bookingIds }, order: [['createdAt', 'DESC']] })
    : [];

  const platformFeePercent = Number(process.env.PLATFORM_FEE_PERCENT) || 0;

  let totalRevenuePaise = 0;
  let refundedAmountPaise = 0;
  const transactions: OrganizerTransactionRow[] = [];

  for (const payment of payments) {
    const booking = bookingById.get(payment.bookingId);
    if (!booking) continue;

    if (payment.status === 'paid' || payment.status === 'refunded') {
      totalRevenuePaise += payment.amountPaise;
    }
    if (payment.status === 'refunded' && booking.refundAmountPaise) {
      refundedAmountPaise += booking.refundAmountPaise;
    }

    const netAmountPaise = Math.round(payment.amountPaise * (1 - platformFeePercent / 100));
    transactions.push({
      id: payment.id,
      createdAt: payment.createdAt.toISOString(),
      customerName: booking.primaryContactName,
      eventName: eventNameById.get(booking.eventId) ?? 'Unknown event',
      amountPaise: payment.amountPaise,
      netAmountPaise,
      method: payment.method,
      status: payment.status,
    });
  }

  return {
    summary: {
      totalRevenuePaise,
      refundedAmountPaise,
      netPaise: Math.round(totalRevenuePaise * (1 - platformFeePercent / 100)) - refundedAmountPaise,
      platformFeePercent,
    },
    transactions,
    bankAccountHolderName: organizer?.bankAccountHolderName ?? null,
    bankAccountNumberLast4: organizer?.bankAccountNumberLast4 ?? null,
    bankIfsc: organizer?.bankIfsc ?? null,
    payoutActive: organizer?.cashfreeVendorStatus === 'active',
  };
}
