// Runs once before all scenario files: brings the test database up to date with
// `prisma migrate deploy` (creates it on first run; applies pending migrations;
// never deletes data). Files isolate themselves by creating their own institutes,
// so rows left by earlier runs do not matter.
// A full rebuild is a deliberate manual step (drop the *_test database yourself).
import { execSync } from 'node:child_process';
import { testDatabaseUrl } from './test-db.mjs';

export default async function globalSetup() {
  const url = testDatabaseUrl();
  process.env.SCENARIO_DATABASE_URL = url;
  if (process.env.SCENARIO_SKIP_MIGRATE === '1') return;
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
  });
}
