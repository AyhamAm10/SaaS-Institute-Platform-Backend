/**
 * [T8] YEAR-E: security over time. Plan: 11-full-year-scenarios.md
 * Two institutes (ألف and باء) live the same three months (September -> November 2026): payments, attendance,
 * exams, notes. Every name of each carries its marker. At the end of every month, every GET route without
 * parameters (read from docs/generated/api.md) is called by A's owner, and every app route by A's family and
 * teacher: no text of B may appear (and the other way round).
 * Mid-October a registrar of A becomes an accountant.
 */
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startApp, type ScenarioApp } from '../support/app';
import { InstituteFixture, signIn } from '../support/builders';
import { type Api, uniquePhone } from '../support/client';
import { realClock, setClock } from '../support/clock';
import { buildWorld, type World } from '../support/world';

/** Staff GET routes without path parameters, from the generated API map. */
function staffReadRoutes(): string[] {
  const map = readFileSync(join(process.cwd(), '../docs/generated/api.md'), 'utf8');
  return [...map.matchAll(/^\| GET \| `([^`]+)` \| ([^|]+) \|/gm)]
    .filter(([, path, access]) => !path.includes(':') && !/public|roles:/i.test(access) && !path.startsWith('/health'))
    .map(([, path]) => path)
    .filter((p) => !p.startsWith('/platform') && !p.startsWith('/institutes') && !p.endsWith('/excel'));
}

// A whole year (or 2,000 students) per file: far beyond the default 2 minutes per test
jest.setTimeout(1_800_000);

describe('[T8] YEAR-E security over time', () => {
  let s: ScenarioApp;
  const inst: Record<'A' | 'B', InstituteFixture> = {} as never;
  const world: Record<'A' | 'B', World> = {} as never;
  const family: Record<'A' | 'B', Api> = {} as never;
  const teacher: Record<'A' | 'B', Api> = {} as never;
  const teacherPhone: Record<'A' | 'B', string> = {} as never;

  /** Every text A's users can read (lists, reports, dashboard, both apps). */
  const everythingReadableBy = async (k: 'A' | 'B'): Promise<string> => {
    const parts: string[] = [];
    for (const path of staffReadRoutes()) {
      const body = await inst[k].admin.call('get', path, undefined, { status: 999 }).catch((e: Error) => e.message);
      parts.push(String(typeof body === 'string' ? body : JSON.stringify(body)));
    }
    const id = world[k].ids.students;
    for (const r of ['overview', 'attendance', 'timetable', 'results', 'notes', 'finance', 'profile']) parts.push(JSON.stringify(await family[k].get(`/mobile/students/${id}/${r}`)));
    parts.push(JSON.stringify(await family[k].get('/mobile/me')));
    parts.push(JSON.stringify(await family[k].get('/notifications?limit=100')));
    for (const r of ['/teacher/me', '/teacher/overview', '/teacher/timetable', '/teacher/sections']) parts.push(JSON.stringify(await teacher[k].get(r)));
    return parts.join('\n');
  };

  /** The same events in both institutes. */
  const month = async (m: string) => {
    for (const k of ['A', 'B'] as const) {
      const a = inst[k].admin;
      const ids = world[k].ids;
      setClock(`2026-${m}-05 09:00`);
      await a.post(`/contracts/${ids.contracts}/payments`, { amount: 100_000, note: `دفعة ${world[k].marker} ${m}` });
      setClock(`2026-${m}-12 07:55`);
      await a.post('/attendance/check-in', { studentId: ids.students }).catch(() => undefined);
      setClock(`2026-${m}-12 10:00`);
      const exam = await a.post('/exams', { sectionId: ids.sections, subjectId: ids.subjects, title: `مذاكرة ${world[k].marker} ${m}`, examDate: `2026-${m}-12`, maxMark: 20, passMark: 10 });
      await a.put(`/exams/${exam.id}/results`, { results: [{ studentId: ids.students, mark: 15 }] });
      await a.post(`/students/${ids.students}/notes`, { body: `ملاحظة ${world[k].marker} ${m}`, visibleToFamily: true }).catch(() =>
        a.post(`/students/${ids.students}/notes`, { body: `ملاحظة ${world[k].marker} ${m}` }));
    }
  };

  beforeAll(async () => {
    setClock('2026-09-01 08:00');
    s = await startApp();
    for (const [k, marker] of [['A', 'مؤشرألف'], ['B', 'مؤشرباء']] as const) {
      inst[k] = await InstituteFixture.create(s, marker);
      world[k] = await buildWorld(inst[k], marker);
      family[k] = await signIn(s, world[k].familyPhone);
      const t = await s.prisma.teacher.findUniqueOrThrow({ where: { id: world[k].ids.teachers }, include: { user: true } });
      teacherPhone[k] = t.user.phone;
      teacher[k] = await signIn(s, teacherPhone[k]);
    }
  }, 600_000);

  afterAll(async () => {
    realClock();
    await s?.close();
  });

  for (const m of ['09', '10', '11']) {
    it(`[YEAR-E ${m}] month ${m}: the same events in both; nothing of B is readable from A, nor of A from B`, async () => {
      await month(m);
      setClock(`2026-${m}-28 20:00`);
      const fromA = await everythingReadableBy('A');
      const fromB = await everythingReadableBy('B');
      expect(fromA.includes(world.B.marker)).toBe(false);
      expect(fromB.includes(world.A.marker)).toBe(false);
      // positive control: each one does see its own records
      expect(fromA.includes(world.A.marker)).toBe(true);
      expect(fromB.includes(world.B.marker)).toBe(true);
    }, 600_000);
  }

  it('[YEAR-E role] a registrar becomes an accountant: a new sign-in gets the new rights at once, the old token within 15 minutes', async () => {
    const a = inst.A.admin;
    const phone = uniquePhone();
    setClock('2026-10-15 09:00');
    const staff = await a.post('/staff', { fullName: `موظف ${world.A.marker}`, phone, role: 'REGISTRAR' });
    const before = await signIn(s, phone);
    const contract = world.A.ids.contracts;
    await before.fails('post', `/contracts/${contract}/payments`, 403, { amount: 1_000 });
    expect((await before.call('get', '/attendance/daily?sectionId=' + world.A.ids.sections)).students ?? true).toBeTruthy();

    await a.patch(`/staff/${staff.id}`, { role: 'ACCOUNTANT' });
    const after = await signIn(s, phone);
    await after.post(`/contracts/${contract}/payments`, { amount: 1_000 });
    await after.fails('post', '/attendance/check-in', 403, { studentId: world.A.ids.students });

    // OPEN DECISION (owner): access tokens are trusted for their 15 minutes without a database lookup, so the old
    // token still carries REGISTRAR right after the change; its refresh is revoked. 16 minutes later it is gone.
    const old = await before.call('get', '/reports/daily-attendance', undefined, { status: 999 }).then(() => 200).catch((e: Error) => Number(/-> (\d{3})/.exec(e.message)?.[1]));
    expect(old).toBe(200);
    setClock('2026-10-15 09:16');
    await before.fails('get', '/reports/daily-attendance', 403); // re-signed in after expiry: ACCOUNTANT now
  });
});
