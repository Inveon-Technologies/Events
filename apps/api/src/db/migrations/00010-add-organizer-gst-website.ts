import { QueryInterface, DataTypes } from 'sequelize';

export async function up({ context: qi }: { context: QueryInterface }) {
  await qi.addColumn('organizers', 'gst_number', { type: DataTypes.STRING, allowNull: true });
  await qi.addColumn('organizers', 'website', { type: DataTypes.STRING, allowNull: true });
}

export async function down({ context: qi }: { context: QueryInterface }) {
  await qi.removeColumn('organizers', 'website');
  await qi.removeColumn('organizers', 'gst_number');
}
