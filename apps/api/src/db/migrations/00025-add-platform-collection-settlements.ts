import { QueryInterface, DataTypes } from 'sequelize';

// Organizers who haven't finished Cashfree vendor verification can now
// take online payments: the money is collected into the platform's own
// Cashfree account (no vendor split) and settled with the organizer
// later, once they're verified. These columns record, per payment, how
// it was collected, who it belongs to, the organizer's share, and
// whether that share has been paid out yet.
export async function up({ context: qi }: { context: QueryInterface }) {
  // split (vendor split to a verified organizer) | platform (collected
  // into the platform account, owed to the organizer)
  await qi.addColumn('payments', 'collection_mode', { type: DataTypes.STRING(16), allowNull: true });
  await qi.addColumn('payments', 'organizer_id', { type: DataTypes.UUID, allowNull: true });
  await qi.addColumn('payments', 'customer_name', { type: DataTypes.STRING, allowNull: true });
  await qi.addColumn('payments', 'organizer_share_paise', { type: DataTypes.INTEGER, allowNull: true });
  // pending | settled — only set for platform-collected payments
  await qi.addColumn('payments', 'settlement_status', { type: DataTypes.STRING(16), allowNull: true });
  await qi.addColumn('payments', 'settled_at', { type: DataTypes.DATE, allowNull: true });
  await qi.addColumn('payments', 'settlement_reference', { type: DataTypes.STRING, allowNull: true });
  await qi.addIndex('payments', ['organizer_id', 'settlement_status']);
}

export async function down({ context: qi }: { context: QueryInterface }) {
  await qi.removeIndex('payments', ['organizer_id', 'settlement_status']);
  await qi.removeColumn('payments', 'settlement_reference');
  await qi.removeColumn('payments', 'settled_at');
  await qi.removeColumn('payments', 'settlement_status');
  await qi.removeColumn('payments', 'organizer_share_paise');
  await qi.removeColumn('payments', 'customer_name');
  await qi.removeColumn('payments', 'organizer_id');
  await qi.removeColumn('payments', 'collection_mode');
}
