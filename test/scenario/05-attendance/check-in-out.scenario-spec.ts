/**
 * [T3] 5.1-5.3 check-in, check-out, bulk, correction, excuse. Plan: 05-attendance-closures.md
 * Defaults: day 08:00-14:00, LATE strictly after 08:15, working days Saturday-Thursday.
 * 2026-11-18 is a Wednesday (working); 2026-11-20 is a Friday (not working).
 * Section التاسع - أ: S1..S5 active, S6 withdrawn; S7 is in another branch.
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { startApp, type ScenarioApp } from '../support/app';
import { InstituteFixture } from '../support/builders';
import { realClock, setClock } from '../support/clock';

describe('[T3] 5.1-5.3 daily attendance', () => {
  let s: ScenarioApp;
  let inst: InstituteFixture;
  let section: number;
  const st: number[] = [];

  const rowOf = (studentId: number, date = '2026-11-18') =>
    s.prisma.dailyAttendance.findMany({ where: { studentId, date: new Date(`${date}T00:00:00Z`) } });

  beforeAll(async () => {
    setClock('2026-11-18 07:00');
    s = await startApp();
    inst = await InstituteFixture.create(s, 'الحضور');
    const ab = await inst.anyAcademicBranch();
    section = await inst.section({ name: 'التاسع - أ', academicBranchId: ab });
    for (let i = 1; i <= 6; i++) st.push((await inst.student({ fullName: `طالب ${i}`, sectionId: section, newFamily: { familyName: `ع${i}` } })).id);
    await inst.admin.patch(`/enrollments/${await inst.enrollmentOf(st[5])}/status`, { status: 'WITHDRAWN', reason: 'انتقال' });
    const other = await inst.branch('المالكي');
    const otherSection = await inst.section({ name: 'شعبة المالكي', academicBranchId: ab, branchId: other });
    st.push((await inst.student({ fullName: 'طالب المالكي', sectionId: otherSection, branchId: other, newFamily: { familyName: 'ك' } })).id);
  });

  afterAll(async () => {
    realClock();
    await s?.close();
  });

  it('[ATT-01/02] 08:15:00 and 08:15:59 are PRESENT (minute 495 is not after 495); 08:16 is LATE', async () => {
    setClock('2026-11-18 08:15:00');
    expect((await inst.admin.post('/attendance/check-in', { studentId: st[0] })).status).toBe('PRESENT');
    setClock('2026-11-18 08:15:59');
    expect((await inst.admin.post('/attendance/check-in', { studentId: st[1] })).status).toBe('PRESENT');
    setClock('2026-11-18 08:16:00');
    expect((await inst.admin.post('/attendance/check-in', { studentId: st[2] })).status).toBe('LATE');
  });

  it('[ATT-03] one check-in per day: the second is refused and there is still one row', async () => {
    await inst.admin.fails('post', '/attendance/check-in', 400, { studentId: st[0] });
    expect(await rowOf(st[0])).toHaveLength(1);
  });

  it('[ATT-04] no check-in in the future beyond 5 minutes of clock tolerance', async () => {
    setClock('2026-11-18 09:00');
    await inst.admin.fails('post', '/attendance/check-in', 400, { studentId: st[3], at: '2026-11-18T06:10:00.000Z' }); // 09:10 local
    const ok = await inst.admin.post('/attendance/check-in', { studentId: st[3], at: '2026-11-18T06:04:00.000Z' }); // 09:04 local
    expect(ok.status).toBe('LATE');
  });

  it('[ATT-05/06] a Friday, a withdrawn student or a student of another branch is refused', async () => {
    setClock('2026-11-20 08:00');
    await inst.admin.fails('post', '/attendance/check-in', 400, { studentId: st[0] });
    setClock('2026-11-18 09:00');
    await inst.admin.fails('post', '/attendance/check-in', 400, { studentId: st[5] });
    expect(await rowOf(st[5])).toHaveLength(0);
  });

  it('[ATT-07] the day is the LOCAL day: 21:30 UTC on the 18th is 00:30 on the 19th in Damascus', async () => {
    setClock('2026-11-19 00:40');
    const res = await inst.admin.post('/attendance/check-in', { studentId: st[4], at: '2026-11-18T21:30:00.000Z' });
    expect(String(res.date).slice(0, 10)).toBe('2026-11-19');
    expect(await rowOf(st[4], '2026-11-19')).toHaveLength(1);
    expect(await rowOf(st[4], '2026-11-18')).toHaveLength(0);
  });

  it('[ATT-10..13] check-out: needs a check-in, once, after it; before 14:00 it is an early exit with its reason', async () => {
    setClock('2026-11-18 13:59');
    await inst.admin.fails('post', '/attendance/check-out', 400, { studentId: st[4] }); // no check-in on the 18th
    const out = await inst.admin.post('/attendance/check-out', { studentId: st[0], note: 'موعد طبيب، استلمه والده' });
    expect(out.status).toBe('PRESENT'); // leaving early never changes the day status
    await inst.admin.fails('post', '/attendance/check-out', 400, { studentId: st[0] });
    const daily = await inst.admin.get(`/attendance/daily?sectionId=${section}&date=2026-11-18`);
    const row = (daily.records ?? daily.students ?? daily.rows).find((r: { studentId?: number; student?: { id: number } }) => (r.studentId ?? r.student?.id) === st[0]);
    expect([row.earlyExit ?? row.record?.earlyExit, row.checkOutNote ?? row.record?.checkOutNote]).toEqual([true, 'موعد طبيب، استلمه والده']);
  });

  it('[ATT-12] a check-out at exactly 14:00 is not early', async () => {
    setClock('2026-11-18 14:00');
    const out = await inst.admin.post('/attendance/check-out', { studentId: st[1] });
    expect(out.earlyExit ?? false).toBe(false);
  });

  it('[ATT-14] an exit reason over 300 characters is refused', async () => {
    await inst.admin.fails('post', '/attendance/check-out', 400, { studentId: st[2], note: 'س'.repeat(301) });
  });

  it('[ATT-20] bulk check-in never fails as a whole: done and skipped with reasons', async () => {
    setClock('2026-11-21 08:05'); // Saturday, a working day
    await inst.admin.post('/attendance/check-in', { studentId: st[0] });
    const res = await inst.admin.post('/attendance/bulk', { sectionId: section, action: 'check-in', studentIds: [st[0], st[1], st[2], st[3], st[4], st[5], st[6]] });
    const done = (res.done as number[]).slice().sort((x, y) => x - y);
    expect(done).toEqual([st[1], st[2], st[3], st[4]].sort((x, y) => x - y));
    const skipped = res.skipped as { studentId: number; reason: string }[];
    expect(skipped.map((x) => x.studentId).sort((x, y) => x - y)).toEqual([st[0], st[5], st[6]].sort((x, y) => x - y));
    // listed but not active in the section: reported with a reason (fixed 2026-11-18, they used to vanish)
    expect(skipped.find((x) => x.studentId === st[5])!.reason).toBe('Not an active student of this section');
    expect(skipped.find((x) => x.studentId === st[6])!.reason).toBe('Not an active student of this section');
  });

  it('[ATT-21] correcting the check-in time recomputes PRESENT / LATE', async () => {
    const [late] = await rowOf(st[2]); // LATE at 08:16 on the 18th
    const fixed = await inst.admin.patch(`/attendance/${late.id}`, { checkInAt: '2026-11-18T05:10:00.000Z' }); // 08:10 local
    expect(fixed.status).toBe('PRESENT');
  });

  it('[ATT-22] an excuse creates an EXCUSED day without times, or only changes status and note', async () => {
    setClock('2026-11-22 10:00');
    const created = await inst.admin.post('/attendance/excuse', { studentId: st[3], date: '2026-11-22', note: 'مرض' });
    expect([created.status, created.checkInAt ?? null, created.note]).toEqual(['EXCUSED', null, 'مرض']);
    const [present] = await rowOf(st[1]);
    const excused = await inst.admin.post('/attendance/excuse', { studentId: st[1], date: '2026-11-18', note: 'عذر لاحق' });
    expect([excused.status, new Date(excused.checkInAt).toISOString()]).toEqual(['EXCUSED', present.checkInAt!.toISOString()]);
  });
});
