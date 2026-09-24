import { QueryInterface, DataTypes } from 'sequelize';

export async function up({ context: qi }: { context: QueryInterface }) {
  await qi.addColumn('events', 'gender_restriction', { type: DataTypes.STRING, allowNull: true });
}

export async function down({ context: qi }: { context: QueryInterface }) {
  await qi.removeColumn('events', 'gender_restriction');
}
