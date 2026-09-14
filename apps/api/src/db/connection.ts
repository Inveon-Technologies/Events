import { Sequelize } from 'sequelize';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  // Fail loudly at import time rather than on the first query — a missing
  // DB URL should never surface as a confusing runtime error mid-request.
  throw new Error('DATABASE_URL is not set (see .env.example)');
}

export const sequelize = new Sequelize(DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
});
