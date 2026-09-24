import { QueryInterface, DataTypes } from 'sequelize';

// Map pins for an event beyond its single venue: group pickup points
// along a route, drop points, meeting points — each with coordinates, an
// optional time and a note. Ordered as the organizer arranged them.
export async function up({ context: qi }: { context: QueryInterface }) {
  await qi.addColumn('events', 'location_points', { type: DataTypes.JSONB, allowNull: true });
}

export async function down({ context: qi }: { context: QueryInterface }) {
  await qi.removeColumn('events', 'location_points');
}
