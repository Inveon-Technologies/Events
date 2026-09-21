import { QueryInterface, DataTypes } from 'sequelize';

// Self-service cancellation defaults to OFF (allow_self_service_cancellation
// false) — an organizer opts in explicitly per event rather than every
// event silently gaining a cancel button the moment this ships. When on,
// refund_cutoff_days and refund_percentage govern what a customer's
// self-service cancellation actually gets them; an organizer-initiated
// cancellation (of one booking, or the whole event) bypasses this policy
// entirely and always refunds in full — that path is never gated by it.
export async function up({ context: qi }: { context: QueryInterface }) {
  await qi.addColumn('events', 'allow_self_service_cancellation', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  });
  await qi.addColumn('events', 'refund_cutoff_days', { type: DataTypes.INTEGER, allowNull: true });
  await qi.addColumn('events', 'refund_percentage', { type: DataTypes.INTEGER, allowNull: true });
  // No new "policy text" column — cancellation_policy (migration 00006)
  // already exists and already serves exactly this purpose (the Policy
  // & FAQ tab's description text). Adding a second, separate text field
  // for the same concept would just be two places for the same content
  // to drift apart.
  await qi.addColumn('events', 'cancellation_reason', { type: DataTypes.TEXT, allowNull: true });

  await qi.addColumn('bookings', 'cancellation_reason', { type: DataTypes.TEXT, allowNull: true });
  await qi.addColumn('bookings', 'cancelled_by', { type: DataTypes.STRING, allowNull: true }); // 'customer' | 'organizer'
  await qi.addColumn('bookings', 'refund_amount_paise', { type: DataTypes.INTEGER, allowNull: true });
  await qi.addColumn('bookings', 'refund_status', { type: DataTypes.STRING, allowNull: true }); // mirrors Cashfree's refund_status
}

export async function down({ context: qi }: { context: QueryInterface }) {
  await qi.removeColumn('bookings', 'refund_status');
  await qi.removeColumn('bookings', 'refund_amount_paise');
  await qi.removeColumn('bookings', 'cancelled_by');
  await qi.removeColumn('bookings', 'cancellation_reason');

  await qi.removeColumn('events', 'cancellation_reason');
  await qi.removeColumn('events', 'refund_percentage');
  await qi.removeColumn('events', 'refund_cutoff_days');
  await qi.removeColumn('events', 'allow_self_service_cancellation');
}
