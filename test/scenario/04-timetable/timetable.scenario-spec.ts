/**
 * [T6] 4.1-4.3 timetable generation, conflicts and reads. Plan: 04-timetable.md
 * Default day: 7 lesson slots (08:00 .. 13:00 starts), 6 working days (no Friday) = 42 slots per section.
 * Sections أ and ب, each: mathematics 6 (رامي), physics 4 + English 3 (هبة), Arabic 5 (محمود) = 18 lessons.
 * Section أ also: drawing 2 (سمر, available only Sunday 08:00-10:15) and music 1 (وسيم, deactivated).
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { startApp, type ScenarioApp } from '../support/app';
import { InstituteFixture, signIn } from '../support/builders';
import { uniquePhone } from '../support/client';
import { realClock, setClock } from '../support/clock';

const STARTS = ['08:00', '08:45', '09:30', '10:45', '11:30', '12:15', '13:00'];

describe('[T6] 4.x timetable', () => {
  let s: ScenarioApp;
  let inst: InstituteFixture;
  const sec: Record<string, number> = {};
  const subj: Record<string, number> = {};
  const t: Record<string, number> = {};
  const phones: Record<string, string> = {};
  let familyPhone: string;
  let studentA: number;

  const entries = (sectionId: number) =>
    s.prisma.timetableEntry.findMany({ where: { timetable: { sectionId } }, orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] });
  const timetableId = async (sectionId: number) => (await s.prisma.timetable.findFirstOrThrow({ where: { sectionId } })).id;
  const generate = (body: Record<string, unknown> = {}) => inst.admin.post(`/academic-years/${inst.yearId}/timetable/generate`, body);

  beforeAll(async () => {
    setClock('2026-09-01 09:00');
    s = await startApp();
    inst = await InstituteFixture.create(s, 'الجدول');
    const ab = await inst.anyAcademicBranch();
    for (const n of ['الرياضيات', 'الفيزياء', 'الإنكليزي', 'العربي', 'الرسم', 'الموسيقى']) subj[n] = await inst.subject(n);
    const teacher = async (key: string, name: string, subjects: string[], availabilities?: unknown[]) => {
      phones[key] = uniquePhone();
      const row = await inst.admin.post('/teachers', {
        fullName: name, phone: phones[key], branchIds: [inst.branchId],
        qualifications: subjects.map((x) => ({ academicBranchId: ab, subjectId: subj[x] })),
        ...(availabilities && { availabilities }),
      });
      t[key] = row.id ?? row.teacher?.id;
    };
    await teacher('rami', 'أ. رامي', ['الرياضيات']);
    await teacher('hiba', 'أ. هبة', ['الفيزياء', 'الإنكليزي']);
    await teacher('mahmoud', 'أ. محمود', ['العربي']);
    await teacher('samar', 'أ. سمر', ['الرسم'], [{ dayOfWeek: 0, startTime: '08:00', endTime: '10:15' }]);
    await teacher('wassim', 'أ. وسيم', ['الموسيقى']);
    for (const n of ['قاعة 1', 'قاعة 2', 'قاعة 3']) await inst.admin.post('/rooms', { name: n, capacity: 30, branchId: inst.branchId });
    for (const key of ['a', 'b']) {
      sec[key] = await inst.section({ name: `التاسع - ${key === 'a' ? 'أ' : 'ب'}`, academicBranchId: ab });
      const plan: [string, number, string][] = [['الرياضيات', 6, 'rami'], ['الفيزياء', 4, 'hiba'], ['الإنكليزي', 3, 'hiba'], ['العربي', 5, 'mahmoud']];
      for (const [name, weeklyPeriods, who] of plan) await inst.admin.post(`/sections/${sec[key]}/subjects`, { subjectId: subj[name], weeklyPeriods, teacherId: t[who] });
    }
    await inst.admin.post(`/sections/${sec.a}/subjects`, { subjectId: subj['الرسم'], weeklyPeriods: 2, teacherId: t.samar });
    await inst.admin.post(`/sections/${sec.a}/subjects`, { subjectId: subj['الموسيقى'], weeklyPeriods: 1, teacherId: t.wassim });
    const wassimUser = await s.prisma.teacher.findUniqueOrThrow({ where: { id: t.wassim } });
    await inst.admin.patch(`/accounts/${wassimUser.userId}/active`, { isActive: false });
    familyPhone = uniquePhone();
    studentA = (await inst.student({ fullName: 'يزن', sectionId: sec.a, newFamily: { familyName: 'الخطيب', fatherName: 'محمد', phone: familyPhone } })).id;
  });

  afterAll(async () => {
    realClock();
    await s?.close();
  });

  it('[TT-01/02/07] generating the year: section أ 20 lessons (18 + drawing 2, no music: teacher inactive), ب 18; only real slots, never Friday', async () => {
    await generate();
    const a = await entries(sec.a);
    const b = await entries(sec.b);
    expect([a.length, b.length]).toEqual([20, 18]);
    expect(a.filter((e) => e.teacherId === t.wassim)).toHaveLength(0);
    for (const e of [...a, ...b]) {
      expect(STARTS).toContain(e.startTime);
      expect(e.dayOfWeek).not.toBe(5);
    }
  });

  it('[TT-01] no teacher, section or room is ever booked twice at the same time (checked in SQL)', async () => {
    for (const col of ['teacher_id', 'timetable_id', 'room_id']) {
      const clashes: { n: bigint }[] = await s.prisma.$queryRawUnsafe(
        `select count(*) as n from (select ${col}, day_of_week, start_time from timetable_entries where institute_id = $1 and ${col} is not null group by 1, 2, 3 having count(*) > 1) x`,
        inst.id,
      );
      expect([col, Number(clashes[0].n)]).toEqual([col, 0]);
    }
  });

  it('[TT-03] a teacher available only Sunday 08:00-10:15 teaches only then', async () => {
    const drawing = (await entries(sec.a)).filter((e) => e.teacherId === t.samar);
    expect(drawing.map((e) => [e.dayOfWeek, e.startTime]).every(([d, st]) => d === 0 && ['08:00', '08:45', '09:30'].includes(st as string))).toBe(true);
    expect(drawing).toHaveLength(2);
  });

  it('[TT-04/05] locked lessons survive a regeneration; regenerating one section leaves the other untouched', async () => {
    const tid = await timetableId(sec.a);
    const locked = (await entries(sec.a)).slice(0, 3);
    for (const e of locked) await inst.admin.patch(`/timetables/${tid}/entries/${e.id}/lock`, { isLocked: true });
    const bBefore = (await entries(sec.b)).map((e) => [e.id, e.dayOfWeek, e.startTime]);
    await generate({ sectionId: sec.a });
    const after = await entries(sec.a);
    for (const e of locked) expect(after.find((x) => x.id === e.id)).toMatchObject({ dayOfWeek: e.dayOfWeek, startTime: e.startTime, isLocked: true });
    expect(after).toHaveLength(20);
    expect((await entries(sec.b)).map((e) => [e.id, e.dayOfWeek, e.startTime])).toEqual(bBefore);
  });

  it('[TT-06] two generations at once: one runs, the other is refused with 409', async () => {
    const results = await Promise.all([generate(), generate()].map((p) => p.then(() => 200).catch((e: Error) => Number(/-> (\d{3})/.exec(e.message)?.[1]))));
    expect(results.sort()).toEqual([200, 409]);
  });

  it('[TT-10..14] manual edits are saved but every problem is reported as a conflict', async () => {
    const tid = await timetableId(sec.b);
    const path = `/academic-years/${inst.yearId}/sections/${sec.b}/timetable/entries`;
    const rami = (await entries(sec.a)).find((e) => e.teacherId === t.rami)!;
    // same teacher, same time, other section (HARD); Friday (HARD); 07:00 (HARD); over the break (HARD)
    await inst.admin.post(path, { subjectId: subj['الرياضيات'], teacherId: t.rami, dayOfWeek: rami.dayOfWeek, startTime: rami.startTime, endTime: rami.endTime });
    await inst.admin.post(path, { subjectId: subj['العربي'], teacherId: t.mahmoud, dayOfWeek: 5, startTime: '08:00', endTime: '08:45' });
    await inst.admin.post(path, { subjectId: subj['العربي'], teacherId: t.mahmoud, dayOfWeek: 1, startTime: '07:00', endTime: '07:45' });
    await inst.admin.post(path, { subjectId: subj['العربي'], teacherId: t.mahmoud, dayOfWeek: 2, startTime: '10:15', endTime: '11:00' });
    const list: { severity: 'HARD' | 'SOFT' }[] = await inst.admin.get(`/timetables/${tid}/conflicts`);
    expect(list.filter((c) => c.severity === 'HARD').length).toBeGreaterThanOrEqual(4);
    expect(list.filter((c) => c.severity === 'SOFT').length).toBeGreaterThanOrEqual(1); // mathematics now 7 periods and Arabic 8 instead of 6 and 5
    expect(await s.prisma.timetableEntry.count({ where: { timetableId: tid } })).toBe(22); // 18 + the 4 manual ones, all saved
  });

  it('[TT-11] a room of another branch is refused', async () => {
    const malki = await inst.branch('المالكي');
    const room = await inst.admin.post('/rooms', { name: 'قاعة المالكي', capacity: 20, branchId: malki });
    await inst.admin.fails('post', `/academic-years/${inst.yearId}/sections/${sec.a}/timetable/entries`, 400, {
      subjectId: subj['الرياضيات'], teacherId: t.rami, roomId: room.id, dayOfWeek: 3, startTime: '13:00', endTime: '13:45',
    });
  });

  it('[TT-20] the teacher app: days in institute order (Saturday first), empty days kept, lessons sorted, count = rows', async () => {
    const rami = await signIn(s, phones.rami);
    const res = await rami.get('/teacher/timetable');
    const days: { dayOfWeek: number; lessons: { startTime: string }[] }[] = res.days;
    expect(days.map((d) => d.dayOfWeek)).toEqual([6, 0, 1, 2, 3, 4]);
    for (const d of days) expect(d.lessons.map((l) => l.startTime)).toEqual(d.lessons.map((l) => l.startTime).toSorted());
    const rows = await s.prisma.timetableEntry.count({ where: { teacherId: t.rami } });
    expect(days.reduce((n, d) => n + d.lessons.length, 0)).toBe(rows);
  });

  it('[TT-21] the parents app shows the 20 lessons of the child\'s section, working days only', async () => {
    const family = await signIn(s, familyPhone);
    const res = await family.get(`/mobile/students/${studentA}/timetable`);
    const days: { weekday?: string; dayOfWeek?: number; slots: unknown[] }[] = res.days;
    expect(days).toHaveLength(6);
    expect(days.reduce((n, d) => n + d.slots.length, 0)).toBe(20);
  });

  it('[TT-22] a teacher asking for a section he does not teach is refused (403, like every teacher-scope check) and no timetable is created', async () => {
    const hibaOnly = await inst.section({ name: 'شعبة بلا رامي', academicBranchId: await inst.anyAcademicBranch() });
    const rami = await signIn(s, phones.rami);
    await rami.fails('get', `/academic-years/${inst.yearId}/sections/${hibaOnly}/timetable`, 403);
    expect(await s.prisma.timetable.count({ where: { sectionId: hibaOnly } })).toBe(0);
  });
});
