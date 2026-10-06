import { QueryInterface } from 'sequelize';

// Eco Pandhari Club's events showed initials in "About the Organizer"
// because the organizer profile has no logo saved. Point it at the
// club's real logo, as published on its own site. Only fills an empty
// logo: a logo the organizer has uploaded themselves is never replaced.
const LOGO_URL = 'https://ecopandhariclub.in/images/eco-pandhari-logo.jpg';

export async function up({ context: qi }: { context: QueryInterface }) {
  await qi.sequelize.query(
    `UPDATE organizers SET logo_url = :logo
      WHERE (logo_url IS NULL OR logo_url = '')
        AND (slug = 'eco-pandhari' OR LOWER(name) = 'eco pandhari club')`,
    { replacements: { logo: LOGO_URL } },
  );
}

export async function down({ context: qi }: { context: QueryInterface }) {
  await qi.sequelize.query('UPDATE organizers SET logo_url = NULL WHERE logo_url = :logo', {
    replacements: { logo: LOGO_URL },
  });
}
