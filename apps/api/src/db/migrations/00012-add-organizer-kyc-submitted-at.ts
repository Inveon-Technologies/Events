import { QueryInterface, DataTypes } from 'sequelize';

export async function up({ context: qi }: { context: QueryInterface }) {
  await qi.addColumn('organizers', 'kyc_submitted_at', { type: DataTypes.DATE, allowNull: true });
}

export async function down({ context: qi }: { context: QueryInterface }) {
  await qi.removeColumn('organizers', 'kyc_submitted_at');
}
