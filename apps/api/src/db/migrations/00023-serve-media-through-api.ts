import { QueryInterface } from 'sequelize';

// Stored image links pointed straight at the S3 bucket
// (https://<bucket>.s3.<region>.amazonaws.com/<key>), which only works
// for a public bucket — and the documented policy only opened events/*,
// so organizer logos and ticket / certificate design images were 403s.
// Every image is now linked as /api/uploads/<key> and served by the API
// (see app.ts); this rewrites the links already saved. A no-op when the
// bucket settings aren't present (local-disk installs).
const COLUMNS: [string, string][] = [
  ['organizers', 'logo_url'],
  ['events', 'banner_url'],
  ['events', 'ticket_background_url'],
  ['event_media', 'url'],
];
const JSON_COLUMNS: [string, string][] = [
  ['events', 'partners'],
  ['events', 'certificate_design'],
];

export async function up({ context: qi }: { context: QueryInterface }) {
  const bucket = process.env.S3_BUCKET;
  const region = process.env.AWS_REGION;
  if (!bucket || !region) return;
  const from = `https://${bucket}.s3.${region}.amazonaws.com/`;
  const to = '/api/uploads/';
  for (const [table, column] of COLUMNS) {
    // eslint-disable-next-line no-await-in-loop
    await qi.sequelize.query(`UPDATE ${table} SET ${column} = REPLACE(${column}, :from, :to) WHERE ${column} LIKE :like`, {
      replacements: { from, to, like: `${from}%` },
    });
  }
  for (const [table, column] of JSON_COLUMNS) {
    // eslint-disable-next-line no-await-in-loop
    await qi.sequelize.query(
      `UPDATE ${table} SET ${column} = REPLACE(${column}::text, :from, :to)::jsonb WHERE ${column}::text LIKE :like`,
      { replacements: { from, to, like: `%${from}%` } },
    );
  }
}

export async function down() {
  // Links keep working either way (the API serves /api/uploads from S3).
}
