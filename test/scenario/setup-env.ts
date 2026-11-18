/**
 * Environment of every scenario file (loaded before the app is imported).
 * Values set here win over `.env` (dotenv never overrides existing variables).
 */
const url = process.env['SCENARIO_DATABASE_URL'];
if (!url || !new URL(url).pathname.slice(1).endsWith('_test')) {
  throw new Error('SCENARIO_DATABASE_URL is missing or not a *_test database (run through npm run test:scenario)');
}

process.env['DATABASE_URL'] = url;
process.env['NODE_ENV'] = 'test';
process.env['JOBS_ENABLED'] = 'false';
process.env['THROTTLE_LOGIN_LIMIT'] = '100000';
process.env['REDIS_KEY_PREFIX'] = 'scenario';
// Test-only platform account of the test database (never used anywhere else)
process.env['SUPER_ADMIN_NUMBER'] = '0900099999';
process.env['SUPER_ADMIN_PASSWORD'] = 'Scenario#Root2026';
process.env['SUPER_ADMIN_NAME'] = 'Scenario Root';
// Firebase is replaced by FakePushSender; make sure the real one never starts
delete process.env['FIREBASE_SERVICE_ACCOUNT_PATH'];
