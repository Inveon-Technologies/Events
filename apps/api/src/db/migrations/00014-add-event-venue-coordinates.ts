import { QueryInterface, DataTypes } from 'sequelize';

export async function up({ context: qi }: { context: QueryInterface }) {
  await qi.addColumn('events', 'venue_latitude', { type: DataTypes.DECIMAL(9, 6), allowNull: true });
  await qi.addColumn('events', 'venue_longitude', { type: DataTypes.DECIMAL(9, 6), allowNull: true });
}

export async function down({ context: qi }: { context: QueryInterface }) {
  await qi.removeColumn('events', 'venue_longitude');
  await qi.removeColumn('events', 'venue_latitude');
}
