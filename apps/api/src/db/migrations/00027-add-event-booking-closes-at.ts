import { QueryInterface, DataTypes } from 'sequelize';

// "Booking open until": lets a multi-day event keep selling tickets after
// its start date without the organizer moving the start date forward each
// day. NULL keeps the old rule (booking closes when the event starts).
export async function up({ context: qi }: { context: QueryInterface }) {
  await qi.addColumn('events', 'booking_closes_at', { type: DataTypes.DATE, allowNull: true });
}

export async function down({ context: qi }: { context: QueryInterface }) {
  await qi.removeColumn('events', 'booking_closes_at');
}
