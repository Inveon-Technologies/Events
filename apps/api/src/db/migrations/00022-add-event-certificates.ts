import { QueryInterface, DataTypes } from 'sequelize';

// Participation certificates, per event: on/off, and the organizer's
// drag-and-drop layout (see services/certificateDesign.ts). NULL design
// means the default layout.
export async function up({ context: qi }: { context: QueryInterface }) {
  await qi.addColumn('events', 'certificate_enabled', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
  await qi.addColumn('events', 'certificate_design', { type: DataTypes.JSONB, allowNull: true });
}

export async function down({ context: qi }: { context: QueryInterface }) {
  await qi.removeColumn('events', 'certificate_design');
  await qi.removeColumn('events', 'certificate_enabled');
}
