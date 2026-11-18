// Resolves the scenario test database URL. Never the dev or production database:
// the database name must end with "_test", otherwise the run stops.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function readDotEnvUrl() {
  const file = resolve(process.cwd(), '.env');
  if (!existsSync(file)) return undefined;
  const line = readFileSync(file, 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
  return line?.slice('DATABASE_URL='.length).replace(/^["']|["']$/g, '');
}

/** SCENARIO_DATABASE_URL if set, else the .env DATABASE_URL with its database renamed to institute_test. */
export function testDatabaseUrl() {
  const explicit = process.env.SCENARIO_DATABASE_URL;
  let url = explicit;
  if (!url) {
    const base = readDotEnvUrl() ?? process.env.DATABASE_URL;
    if (!base) throw new Error('No DATABASE_URL: set SCENARIO_DATABASE_URL for the scenario tests');
    const parsed = new URL(base);
    parsed.pathname = '/institute_test';
    url = parsed.toString();
  }
  const name = new URL(url).pathname.replace(/^\//, '');
  if (!name.endsWith('_test')) {
    throw new Error(`Refusing to run scenario tests on database "${name}": its name must end with _test`);
  }
  return url;
}
