import { QueryInterface, DataTypes } from 'sequelize';

// JSONB rather than separate normalized tables — schedule items, packing
// checklist entries, and FAQ pairs are always read and written as a
// whole alongside their event, never queried or joined independently,
// so a normalized table (event_schedule_items, event_faqs, ...) would
// add migration/model overhead without buying anything real.
export async function up({ context: qi }: { context: QueryInterface }) {
  await qi.addColumn('events', 'schedule_items', {
    type: DataTypes.JSONB,
    allowNull: true,
  });
  await qi.addColumn('events', 'packing_checklist', {
    type: DataTypes.JSONB,
    allowNull: true,
  });
  await qi.addColumn('events', 'faq_items', {
    type: DataTypes.JSONB,
    allowNull: true,
  });
}

export async function down({ context: qi }: { context: QueryInterface }) {
  await qi.removeColumn('events', 'faq_items');
  await qi.removeColumn('events', 'packing_checklist');
  await qi.removeColumn('events', 'schedule_items');
}
