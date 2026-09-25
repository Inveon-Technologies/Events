import { QueryInterface, DataTypes } from 'sequelize';

// Whether the booking confirmation reached the customer by email and by
// WhatsApp ('sent' | 'failed' | 'skipped'), shown on the ticket page
// ("Ticket delivered to"). NULL until the confirmation job has run.
export async function up({ context: qi }: { context: QueryInterface }) {
  await qi.addColumn('bookings', 'confirmation_email_status', { type: DataTypes.STRING(16), allowNull: true });
  await qi.addColumn('bookings', 'confirmation_whatsapp_status', { type: DataTypes.STRING(16), allowNull: true });
}

export async function down({ context: qi }: { context: QueryInterface }) {
  await qi.removeColumn('bookings', 'confirmation_whatsapp_status');
  await qi.removeColumn('bookings', 'confirmation_email_status');
}
