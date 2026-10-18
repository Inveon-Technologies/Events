import { QueryInterface, DataTypes } from 'sequelize';

// Group bookings can send each ticket to its own attendee instead of all
// of them to the buyer. The booking records which way was chosen, and
// each ticket keeps the WhatsApp number and email it is sent to (null
// for tickets that go to the buyer).
export async function up({ context: qi }: { context: QueryInterface }) {
  // buyer (every ticket to the booking's contact) | individual (each
  // ticket also to its own attendee)
  await qi.addColumn('bookings', 'ticket_delivery', { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'buyer' });
  await qi.addColumn('tickets', 'attendee_whatsapp', { type: DataTypes.STRING, allowNull: true });
  await qi.addColumn('tickets', 'attendee_email', { type: DataTypes.STRING, allowNull: true });
}

export async function down({ context: qi }: { context: QueryInterface }) {
  await qi.removeColumn('tickets', 'attendee_email');
  await qi.removeColumn('tickets', 'attendee_whatsapp');
  await qi.removeColumn('bookings', 'ticket_delivery');
}
