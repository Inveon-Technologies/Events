import { QueryInterface, DataTypes } from 'sequelize';

// Nullable + backfilled rather than NOT NULL from the start — existing
// seeded events have no slug yet. Backfilled from each event's own name
// (lowercased, slugified) plus its id's first 8 characters to guarantee
// uniqueness without needing to detect collisions row by row here; new
// events going forward get a properly deduplicated slug from
// eventCreation.ts instead (checked against real neighbors at creation
// time, no random suffix needed unless there's an actual collision).
export async function up({ context: qi }: { context: QueryInterface }) {
  await qi.addColumn('events', 'slug', {
    type: DataTypes.STRING,
    allowNull: true,
  });

  await qi.sequelize.query(`
    UPDATE events
    SET slug = lower(regexp_replace(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'), '(^-|-$)', '', 'g')) || '-' || substring(id::text, 1, 8)
    WHERE slug IS NULL
  `);

  await qi.addConstraint('events', {
    fields: ['slug'],
    type: 'unique',
    name: 'events_slug_unique',
  });
}

export async function down({ context: qi }: { context: QueryInterface }) {
  await qi.removeConstraint('events', 'events_slug_unique');
  await qi.removeColumn('events', 'slug');
}
