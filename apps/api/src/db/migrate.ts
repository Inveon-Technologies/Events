import { Umzug, SequelizeStorage } from 'umzug';
import { sequelize } from './connection';

const umzug = new Umzug({
  migrations: {
    glob: 'src/db/migrations/*.ts',
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
