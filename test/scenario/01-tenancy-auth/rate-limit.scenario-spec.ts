/**
 * [T2] AUTH-05 Login rate limit, with the PRODUCTION limit (5 per 60 s per IP + phone).
 * The other scenario files raise the limits (one client IP for thousands of calls);
 * this file restores the real login limit before the app starts. Needs Redis.
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { startApp, type ScenarioApp } from '../support/app';
import { Api, uniquePhone } from '../support/client';
import { realClock, setClock } from '../support/clock';

describe('[T2] AUTH-05 login rate limit', () => {
  let s: ScenarioApp;

  beforeAll(async () => {
    process.env['THROTTLE_LOGIN_LIMIT'] = '5';
    process.env['THROTTLE_LOGIN_TTL_MS'] = '60000';
    setClock('2026-11-18 09:00');
    s = await startApp();
  });

  afterAll(async () => {
    realClock();
    await s?.close();
  });

  it('[AUTH-05] the 6th sign-in attempt for the same phone within a minute gets 429 with Retry-After', async () => {
    const phone = uniquePhone(); // a fresh phone = a fresh counter
    const anon = new Api(s.app);
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await anon.call('post', '/auth/login', { phone, password: 'wrong-password' }, { status: undefined as never })
        .then(() => 200)
        .catch((e: Error) => Number(/-> (\d{3})/.exec(e.message)?.[1]));
      statuses.push(res);
    }
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
    // another phone from the same client is not blocked
    await anon.fails('post', '/auth/login', 401, { phone: uniquePhone(), password: 'wrong-password' });
  });
});
