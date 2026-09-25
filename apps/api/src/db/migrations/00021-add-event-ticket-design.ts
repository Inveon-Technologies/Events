import { QueryInterface, DataTypes } from 'sequelize';

// Per-event ticket design, set by the organizer: the background image
// behind the event title on the ticket page / email / PDF, and up to 10
// "Partners & Supporters" logos ([{ name, role, logoUrl }]).
export async function up({ context: qi }: { context: QueryInterface }) {
  await qi.addColumn('events', 'ticket_background_url', { type: DataTypes.STRING(2048), allowNull: true });
  await qi.addColumn('events', 'partners', { type: DataTypes.JSONB, allowNull: true });
}

export async function down({ context: qi }: { context: QueryInterface }) {
  await qi.removeColumn('events', 'partners');
  await qi.removeColumn('events', 'ticket_background_url');
}
