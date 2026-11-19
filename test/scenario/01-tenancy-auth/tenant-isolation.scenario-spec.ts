/**
 * [T2] 1.1 Tenant isolation. Plan: docs/private/test-plan/01-tenancy-auth-roles.md
 *
 * Institute B owns one record of every kind, all named with a marker. Institute A's
 * admin then calls EVERY endpoint that takes an id (read from docs/generated/api.md,
 * so a new endpoint is covered automatically) with B's ids. A call fails the test if:
 *   - it answers 5xx, or
 *   - it answers 2xx with B's marker in the body (a leak), or
 * and at the end every row B owns (every table with institute_id) must be unchanged.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { startApp, type ScenarioApp } from '../support/app';
import { InstituteFixture, signIn } from '../support/builders';
import { realClock, setClock } from '../support/clock';
import { buildWorld, tenantFingerprint, type World } from '../support/world';

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';
interface Endpoint { method: Method; path: string }

/** Every endpoint with a route parameter, from the generated API map. */
function parameterizedEndpoints(): Endpoint[] {
  const md = readFileSync(resolve(process.cwd(), '../docs/generated/api.md'), 'utf8');
  const out: Endpoint[] = [];
  for (const m of md.matchAll(/^\| (GET|POST|PATCH|PUT|DELETE) \| `([^`]+)` \|/gm)) {
    if (m[2].includes(':')) out.push({ method: m[1].toLowerCase() as Method, path: m[2] });
  }
  return out;
}

/** Paths that do not take a tenant record id (or are covered by their own test). */
const NOT_A_RECORD = [/^\/files\//, /^\/reports\/:key/, /^\/reports\/verify\//, /^\/mobile\//, /^\/payments\/by-receipt\//];

/** Valid bodies for the writes, so a refusal can only come from the tenant check. */
function bodyFor(e: Endpoint, b: World): unknown {
  const id = b.ids;
  const bodies: Record<string, unknown> = {
    'patch /students/:id': { fullName: 'تعديل من معهد آخر' },
    'post /contracts/:id/payments': { amount: 1 },
    'patch /payments/:id/cancel': { reason: 'إلغاء من معهد آخر' },
    'patch /contracts/:id': { discountReason: 'من معهد آخر' },
    'put /exams/:id/results': { results: [{ studentId: id['students'], mark: 5 }] },
    'patch /exams/:id': { title: 'من معهد آخر' },
    'patch /attendance/:id': { note: 'من معهد آخر' },
    'patch /enrollments/:id/status': { status: 'WITHDRAWN', reason: 'من معهد آخر' },
    'patch /enrollments/:id/transfer': { sectionId: id['sections'] },
    'put /enrollments/:id/subjects': { subjectIds: [id['subjects']] },
    'post /enrollments/:id/contract': { numberOfInstallments: 1 },
    'post /enrollments/:id/contract/preview': { numberOfInstallments: 1 },
    'patch /sections/:id/fee': { feeAmount: 5 },
    'patch /sections/:id': { name: 'من معهد آخر' },
    'post /sections/:id/subjects': { subjectId: id['subjects'], weeklyPeriods: 1 },
    'post /sections/:sectionId/enrollments': { studentIds: [id['students']] },
    'patch /families/:id': { familyName: 'من معهد آخر' },
    'post /families/:id/payments': { payments: [{ contractId: id['contracts'], amount: 1 }] },
    'patch /student-notes/:id': { body: 'من معهد آخر' },
    'post /students/:studentId/notes': { body: 'من معهد آخر' },
    'patch /teachers/:id': { fullName: 'من معهد آخر' },
    'patch /teachers/:id/active': { isActive: false },
    'post /teachers/:id/assignments': { academicBranchId: id['academic-branches'], subjectId: id['subjects'] },
    'post /teachers/:id/availability': { availabilities: [{ dayOfWeek: 0, startTime: '08:00', endTime: '09:00' }] },
    'patch /accounts/:id/active': { isActive: false },
    'patch /staff/:id': { fullName: 'من معهد آخر' },
    'patch /rooms/:id/active': { isActive: false },
    'patch /closures/:id': { reason: 'من معهد آخر' },
    'patch /academic-years/:id': { name: 'من معهد آخر' },
    'patch /timetables/:id/entries/:entryId': { subjectId: id['subjects'], teacherId: id['teachers'], dayOfWeek: 1, startTime: '09:00', endTime: '09:45' },
    'post /timetables/:id/entries': { subjectId: id['subjects'], teacherId: id['teachers'], dayOfWeek: 2, startTime: '09:00', endTime: '09:45' },
    'post /academic-years/:academicYearId/sections/:sectionId/timetable/entries': { subjectId: id['subjects'], teacherId: id['teachers'], dayOfWeek: 3, startTime: '09:00', endTime: '09:45' },
    'put /student-fields/:id': { label: 'من معهد آخر', type: 'TEXT' },
  };
  const key = `${e.method} ${e.path}`;
  if (key in bodies) return bodies[key];
  if (e.method === 'patch') return { name: 'من معهد آخر' };
  return e.method === 'get' || e.method === 'delete' ? undefined : {};
}

describe('[T2] 1.1 tenant isolation', () => {
  let s: ScenarioApp;
  let a: InstituteFixture;
  let b: InstituteFixture;
  let world: World;
  let before: Record<string, string>;

  beforeAll(async () => {
    setClock('2026-11-18 09:00');
    s = await startApp();
    a = await InstituteFixture.create(s, 'المعهد أ');
    b = await InstituteFixture.create(s, 'المعهد ب');
    world = await buildWorld(b, 'SECRETB');
    await buildWorld(a, 'OWN-A'); // A has the same kinds of data, so "empty list" is not the only safe answer
    await new Promise((r) => setTimeout(r, 1000)); // let B's background events settle
    before = await tenantFingerprint(b);
  });

  afterAll(async () => {
    realClock();
    await s?.close();
  });

  it('[TEN-14] no endpoint lets institute A read or change a record of institute B', async () => {
    const endpoints = parameterizedEndpoints().filter((e) => !NOT_A_RECORD.some((re) => re.test(e.path)));
    expect(endpoints.length).toBeGreaterThan(100);
    // Reads first, writes next, deletes last (a broken delete must not hide other leaks)
    const order: Record<Method, number> = { get: 0, post: 1, put: 1, patch: 1, delete: 2 };
    endpoints.sort((x, y) => order[x.method] - order[y.method]);

    const violations: string[] = [];
    const skipped: string[] = [];
    const statuses: Record<string, number> = {};
    let controlHits = 0;
    let controlReads = 0;
    for (const e of endpoints) {
      const segment = e.path.split('/')[1];
      let missing = false;
      const path = e.path.replace(/:([a-zA-Z]+)/g, (_, param: string) => {
        const id = param === 'id' ? world.ids[segment] : world.ids[param];
        if (id === undefined) missing = true;
        return String(id);
      });
      if (missing) {
        skipped.push(`${e.method.toUpperCase()} ${e.path}`);
        continue;
      }
      const res = await a.admin.call(e.method, path, bodyFor(e, world), { status: undefined as never }).catch((err: Error) => err);
      const text = res instanceof Error ? res.message : JSON.stringify(res);
      const status = res instanceof Error ? Number(/-> (\d{3})/.exec(res.message)?.[1]) : 200;
      statuses[status] = (statuses[status] ?? 0) + 1;
      if (status >= 500) violations.push(`${e.method.toUpperCase()} ${e.path} -> ${status} (server error)`);
      else if (status < 300 && text.includes(world.marker)) violations.push(`${e.method.toUpperCase()} ${e.path} -> ${status} LEAK: ${text.slice(0, 160)}`);

      // Positive control: the OWNER reading the same path must see its own marker
      if (e.method === 'get') {
        controlReads++;
        const own = await b.admin.call('get', path).catch(() => null);
        if (own && JSON.stringify(own).includes(world.marker)) controlHits++;
      }
    }

    // The scan is meaningful only if the owner really sees its data through these paths
    expect({ controlReads, controlHits: controlHits >= Math.floor(controlReads * 0.7) }).toEqual({ controlReads, controlHits: true });
    // Refusals must be real tenant refusals, not a broken token (401) for everything
    expect(statuses['401'] ?? 0).toBe(0);
    expect(violations).toEqual([]);
    expect(skipped).toEqual([]);
    console.log(`[TEN-14] statuses ${JSON.stringify(statuses)}; owner control ${controlHits}/${controlReads}`);
    const after = await tenantFingerprint(b);
    const changed = Object.keys(before).filter((t) => before[t] !== after[t]);
    expect(changed).toEqual([]);
  });

  it('[TEN-04] lookup by receipt number shows only the caller\'s own institute', async () => {
    const found = await a.admin.get(`/payments/by-receipt/${world.receiptNumber}`);
    expect(JSON.stringify(found)).not.toContain(world.marker);
  });

  it('[TEN-08] searching students by B\'s name finds nothing in A', async () => {
    const res = await a.admin.get(`/students?search=${encodeURIComponent(world.marker)}`);
    expect(res.data ?? res).toEqual([]);
  });

  it('[TEN-12] a guardian of A cannot open any parents-app page of a child of B (404 everywhere)', async () => {
    const aWorldFamily = await s.prisma.user.findFirstOrThrow({ where: { instituteId: a.id, role: 'FAMILY' } });
    const guardian = await signIn(s, aWorldFamily.phone);
    for (const page of ['overview', 'attendance', 'timetable', 'results', 'notes', 'finance', 'profile']) {
      await guardian.fails('get', `/mobile/students/${world.ids['students']}/${page}`, 404);
    }
  });

  it('[TEN-11] B\'s notifications never reach A\'s users', async () => {
    const aUsers = await s.prisma.user.findMany({ where: { instituteId: a.id }, select: { id: true } });
    const leaked = await s.prisma.notification.count({
      where: { userId: { in: aUsers.map((u) => u.id) }, OR: [{ title: { contains: world.marker } }, { body: { contains: world.marker } }] },
    });
    expect(leaked).toBe(0);
  });
});
