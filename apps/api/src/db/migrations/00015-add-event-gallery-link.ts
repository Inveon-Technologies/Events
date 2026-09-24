import { QueryInterface, DataTypes } from 'sequelize';

// A link the organizer adds after the event (their own Google Drive /
// Google Photos folder) where attendees can see the event's photos and
// videos. Stored as a plain link — nothing is fetched or integrated.
export async function up({ context: qi }: { context: QueryInterface }) {
  await qi.addColumn('events', 'gallery_url', { type: DataTypes.STRING(2048), allowNull: true });
  await qi.addColumn('events', 'gallery_note', { type: DataTypes.TEXT, allowNull: true });
  await qi.addColumn('events', 'gallery_updated_at', { type: DataTypes.DATE, allowNull: true });
}

export async function down({ context: qi }: { context: QueryInterface }) {
  await qi.removeColumn('events', 'gallery_updated_at');
  await qi.removeColumn('events', 'gallery_note');
  await qi.removeColumn('events', 'gallery_url');
}
