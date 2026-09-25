import { Sequelize } from 'sequelize';
import { logger } from '../logger';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  // Don't throw here — this module is imported transitively by anything
  // that touches the models (including app.ts once routes need the DB),
  // and Sequelize's constructor only parses the URL, it doesn't open a
  // connection. Throwing eagerly would break /health and any other
  // DB-independent code path in environments that never configured a
  // database (e.g. the plain lint-test-build CI job, which has no
  // Postgres service). A real connection attempt against this placeholder
  // will fail loudly and obviously when something actually queries it.
  logger.warn('DATABASE_URL is not set (see .env.example) — DB queries will fail');
}

export const sequelize = new Sequelize(
  DATABASE_URL ?? 'postgres://unset:unset@localhost:5432/unset',
  {
    dialect: 'postgres',
    logging: false,
    // Sequelize's default pool is 5 connections, which queued requests
    // behind each other at the gate rush (#66 load test: p95 ~300ms at
    // ~90 scans/s). Keep DB_POOL_MAX x API processes under Postgres'
    // max_connections (100 by default).
    pool: {
      max: Number(process.env.DB_POOL_MAX) || 20,
      min: 0,
      acquire: 30_000,
      idle: 10_000,
    },
  },
);

