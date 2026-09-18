/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  // Concurrency tests need a real Postgres+Redis (DATABASE_URL/REDIS_URL
  // set) and are deliberately excluded from the plain `npm test` run,
  // which has neither. `npm run test:concurrency` overrides this via
  // --testPathIgnorePatterns to include them instead.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/tests/concurrency/'],
};
