import path from 'path';
import { Umzug, SequelizeStorage } from 'umzug';
import { sequelize } from './connection';

const umzug = new Umzug({
  // __dirname-relative, not a hardcoded 'src/...' path — this file runs
  // two different ways with two different working directories: via tsx
  // against the TS source in dev (where this resolves to
  // src/db/migrations/*.ts), and via plain `node` against the compiled
  // output in production (dist/db/migrations/*.js) since the production
  // image has no tsx and no src/ directory at all, only dist/. A
  // hardcoded 'src/db/migrations/*.ts' silently matched zero files in
  // that second case — found live when production's users table turned
  // out not to exist despite the connection finally working.
  migrations: {
    glob: path.join(__dirname, 'migrations/*.{ts,js}'),
  },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize }),
  logger: console,
});

async function main() {
  const direction = process.argv[2];

  if (direction === 'down') {
    await umzug.down();
  } else {
    await umzug.up();
  }

  await sequelize.close();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
