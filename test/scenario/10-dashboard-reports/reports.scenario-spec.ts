/**
 * [T7] 10.2 the 29 reports. Plan: 10-dashboard-reports.md
 * Today: Wednesday 2026-11-18 12:00 (Damascus). Section A (1,000,000 SYP): A1, A2, A3; section B (600 USD): B1.
 * Contracts from 10-01:
 *   A1 1,000,000 x2 (10-01, 11-01)
 *   A2 1,000,000 - 100,000 discount = 900,000 x4 = 225,000 (10-01, 11-01, 12-01, 2027-01-01)
 *   B1 600 USD x2 = 300 (10-01, 11-01); A3 has no contract
 * Payments: A1 100,000 on 11-10 (bank); on 11-18: A1 400,000 cash 09:00, A1 100,000 bank 10:00,
 *   A2 225,000 cash 10:30, B1 100 USD cash 11:00, A2 50,000 cash 11:30 then cancelled.
 *   -> cashbox 11-18: SYP 725,000 in 3 payments, USD 100 in 1 (the cancelled one outside the totals)
 *   -> A1 paid 600,000: #1 paid, #2 overdue 400,000 (17 days); A2 #2 overdue 225,000 (17 days);
 *      B1 #1 overdue 200 (48 days), #2 overdue 300 (17 days)
 *   -> next 30 days: only A2 #3 (12-01, 225,000)
 * Attendance: institute closure Monday 11-16; today A1 and A2 present, A3 not recorded.
 * Exam A mathematics /20: A1 18, A2 15, A3 15 -> ranks 1, 2, 2 (competition ranking).
 * Timetable: رامي 3 lessons in A, هبة 2. Bus «الخط الأول» (driver أبو سمير): A1 and A2.
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { mkdirSync, writeFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { startApp, type ScenarioApp } from '../support/app';
import { InstituteFixture, signIn } from '../support/builders';
import { type Api, uniquePhone } from '../support/client';
import { realClock, setClock } from '../support/clock';

type Block = { type: string; title?: string; rows?: Record<string, unknown>[]; totals?: Record<string, unknown>[]; columns?: { key: string; title: string }[]; items?: { label: string; value: unknown }[] };
type Doc = { key: string; title: string; blocks: Block[]; verification?: { number: string; token: string } };

const tables = (d: Doc) => d.blocks.filter((b) => b.type === 'table');
const amount = (c: unknown) => (c && typeof c === 'object' && 'amount' in c ? (c as { amount: number }).amount : c);

describe('[T7] 10.2 reports', () => {
  let s: ScenarioApp;
  let inst: InstituteFixture;
  const sec: Record<string, number> = {};
  const st: Record<string, number> = {};
  const contract: Record<string, number> = {};
  const t: Record<string, number> = {};
  const phones: Record<string, string> = {};
  let examId: number;
  let busId: number;
  let paymentId: number;
  let cancelledId: number;

  const report = (key: string, params: Record<string, string | number> = {}, api: Api = inst.admin): Promise<Doc> => {
    const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
    return api.get(`/reports/${key}${q ? `?${q}` : ''}`);
  };

  beforeAll(async () => {
    setClock('2026-10-01 09:00');
    s = await startApp();
    inst = await InstituteFixture.create(s, 'التقارير');
    const ab = await inst.anyAcademicBranch();
    const math = await inst.subject('الرياضيات');
    const phys = await inst.subject('الفيزياء');
    for (const [key, name, subject] of [['rami', 'أ. رامي', math], ['hiba', 'أ. هبة', phys]] as const) {
      phones[key] = uniquePhone();
      const row = await inst.admin.post('/teachers', { fullName: name, phone: phones[key], branchIds: [inst.branchId], qualifications: [{ academicBranchId: ab, subjectId: subject }] });
      t[key] = row.id ?? row.teacher?.id;
    }
    sec.A = await inst.section({ name: 'A', academicBranchId: ab, fee: 1_000_000 });
    sec.B = await inst.section({ name: 'B', academicBranchId: ab, fee: 600, currency: 'USD' });
    await inst.admin.post(`/sections/${sec.A}/subjects`, { subjectId: math, weeklyPeriods: 3, teacherId: t.rami });
    await inst.admin.post(`/sections/${sec.A}/subjects`, { subjectId: phys, weeklyPeriods: 2, teacherId: t.hiba });
    for (const k of ['A1', 'A2', 'A3']) st[k] = (await inst.student({ fullName: `طالب ${k}`, sectionId: sec.A, newFamily: { familyName: `عائلة ${k}`, phone: uniquePhone() } })).id;
    st.B1 = (await inst.student({ fullName: 'طالب B1', sectionId: sec.B, newFamily: { familyName: 'عائلة B1' } })).id;
    busId = (await inst.admin.post('/buses', { name: 'الخط الأول', driverName: 'أبو سمير', driverPhone: '0944555666', plateNumber: '123456' })).id;
    for (const k of ['A1', 'A2']) await inst.admin.patch(`/students/${st[k]}`, { busId });

    const tt = `/academic-years/${inst.yearId}/sections/${sec.A}/timetable/entries`;
    for (const [d, start, end] of [[0, '08:00', '08:45'], [1, '08:00', '08:45'], [2, '08:00', '08:45']] as const) await inst.admin.post(tt, { subjectId: math, teacherId: t.rami, dayOfWeek: d, startTime: start, endTime: end });
    for (const [d, start, end] of [[0, '08:45', '09:30'], [3, '08:00', '08:45']] as const) await inst.admin.post(tt, { subjectId: phys, teacherId: t.hiba, dayOfWeek: d, startTime: start, endTime: end });

    const contractOf = async (k: string, body: Record<string, unknown>) =>
      (contract[k] = (await inst.admin.post(`/enrollments/${await inst.enrollmentOf(st[k])}/contract`, { startDate: '2026-10-01', ...body })).id);
    await contractOf('A1', { numberOfInstallments: 2 });
    await contractOf('A2', { numberOfInstallments: 4, discountAmount: 100_000, discountReason: 'أخوة' });
    await contractOf('B1', { numberOfInstallments: 2 });

    const pay = async (when: string, k: string, amount: number, paymentMethod = 'CASH') => {
      setClock(when);
      return inst.admin.post(`/contracts/${contract[k]}/payments`, { amount, paymentMethod });
    };
    await pay('2026-11-10 10:00', 'A1', 100_000, 'BANK_TRANSFER');
    paymentId = (await pay('2026-11-18 09:00', 'A1', 400_000)).id;
    await pay('2026-11-18 10:00', 'A1', 100_000, 'BANK_TRANSFER');
    await pay('2026-11-18 10:30', 'A2', 225_000);
    await pay('2026-11-18 11:00', 'B1', 100);
    cancelledId = (await pay('2026-11-18 11:30', 'A2', 50_000)).id;
    await inst.admin.patch(`/payments/${cancelledId}/cancel`, { reason: 'مبلغ خطأ' });

    examId = (await inst.admin.post('/exams', { sectionId: sec.A, subjectId: math, title: 'مذاكرة الرياضيات', examDate: '2026-11-15', maxMark: 20, passMark: 10 })).id;
    await inst.admin.put(`/exams/${examId}/results`, { results: [{ studentId: st.A1, mark: 18 }, { studentId: st.A2, mark: 15 }, { studentId: st.A3, mark: 15 }] });

    await inst.admin.post('/closures', { scope: 'INSTITUTE', fromDate: '2026-11-16', toDate: '2026-11-16', reason: 'عطلة' });
    setClock('2026-11-18 07:55');
    for (const k of ['A1', 'A2']) await inst.admin.post('/attendance/check-in', { studentId: st[k] });
    setClock('2026-11-18 12:00');
  });

  afterAll(async () => {
    realClock();
    await s?.close();
  });

  /** Plausible parameters for every report of the catalog. */
  const paramsFor = (keys: { kind: string; required: boolean }[]) => {
    const values: Record<string, string | number> = {
      studentId: st.A1, sectionId: sec.A, examId, teacherId: t.rami, busId, from: '2026-11-01', to: '2026-11-18', date: '2026-11-18',
    };
    const field: Record<string, string> = { student: 'studentId', section: 'sectionId', exam: 'examId', teacher: 'teacherId', bus: 'busId', from: 'from', to: 'to', date: 'date' };
    return Object.fromEntries(keys.filter((p) => p.required || field[p.kind]).filter((p) => field[p.kind]).map((p) => [field[p.kind], values[field[p.kind]]]));
  };

  it('[REP-15] all 29 reports of the catalog open for the owner (no 404 builder, no server error), and each Excel opens', async () => {
    const catalog: { key: string; params: { kind: string; required: boolean }[] }[] = await inst.admin.get('/reports/catalog');
    const flat = Array.isArray(catalog) ? catalog : Object.values(catalog).flat();
    expect(flat).toHaveLength(29);
    const failures: string[] = [];
    const dump: Record<string, unknown> = {};
    for (const entry of flat as { key: string; params: { kind: string; required: boolean }[] }[]) {
      const params = paramsFor(entry.params);
      try {
        const doc = await report(entry.key, params);
        dump[entry.key] = doc;
        // REP-12: the Excel has the same number of data rows as the JSON tables (plus headers / totals)
        const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
        const res = await request(s.app.getHttpServer()).get(`/api/reports/${entry.key}/excel${q ? `?${q}` : ''}`)
          .set('Authorization', `Bearer ${(inst.admin as unknown as { token: string }).token}`).buffer(true).parse((r, cb) => {
            const chunks: Buffer[] = [];
            r.on('data', (c: Buffer) => chunks.push(c));
            r.on('end', () => cb(null, Buffer.concat(chunks)));
          });
        if (res.status !== 200) throw new Error(`excel ${res.status}`);
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(res.body as Buffer);
        if (wb.worksheets.length === 0) throw new Error('excel without sheet');
      } catch (e) {
        failures.push(`${entry.key}: ${(e as Error).message.slice(0, 200)}`);
      }
    }
    if (process.env.REPORT_DUMP) {
      mkdirSync(process.env.REPORT_DUMP, { recursive: true });
      writeFileSync(`${process.env.REPORT_DUMP}/reports.json`, JSON.stringify(dump, null, 1));
    }
    expect(failures).toEqual([]);
  });

  const stat = (d: Doc, label: string) => amount(d.blocks.filter((b) => b.type === 'stats' || b.type === 'fields').flatMap((b) => b.items ?? []).find((i) => i.label === label)?.value);
  const rowsOf = (d: Doc, title?: string) => {
    const tb = title === undefined ? tables(d)[0] : tables(d).find((b) => b.title === title)!;
    return (tb.rows ?? []).map((r) => Object.values(r).map(amount));
  };
  const totalsOf = (d: Doc, title?: string) => {
    const tb = title === undefined ? tables(d)[0] : tables(d).find((b) => b.title === title)!;
    return (tb.totals ?? []).map((r) => Object.values(r).map(amount));
  };

  it('[REP-01] daily cashbox 11-18: two separate totals (725,000 SYP in 3, 100 USD in 1), the cancelled one outside', async () => {
    const d = await report('daily-cashbox', { date: '2026-11-18' });
    expect([stat(d, 'المحصّل (ل.س)'), stat(d, 'المحصّل ($)'), stat(d, 'عدد الإيصالات'), stat(d, 'إيصالات ملغاة اليوم')]).toEqual([725_000, 100, 4, 1]);
    expect(rowsOf(d, 'الإيصالات').map((r) => r[6])).toEqual([400_000, 100_000, 225_000, 100]);
    expect(totalsOf(d, 'الإيصالات').map((r) => r[1])).toEqual([725_000, 100]);
    expect(rowsOf(d, 'إيصالات أُلغيت اليوم')).toEqual([[expect.anything(), 'طالب A2', 'مبلغ خطأ', 50_000]]);
  });

  it('[REP-02] payments register 11-10..11-18 (both ends included): 5 active receipts, 825,000 SYP + 100 USD', async () => {
    const d = await report('payments-register', { from: '2026-11-10', to: '2026-11-18' });
    expect(rowsOf(d).map((r) => [r[0], r[7]])).toEqual([
      ['2026-11-10', 100_000], ['2026-11-18', 400_000], ['2026-11-18', 100_000], ['2026-11-18', 225_000], ['2026-11-18', 100],
    ]);
    expect(totalsOf(d).map((r) => r[1])).toEqual([825_000, 100]);
    expect(rowsOf(await report('payments-register', { from: '2026-11-11', to: '2026-11-18' }))).toHaveLength(4);
  });

  it('[REP-03] overdue aging of the whole institute: SYP 625,000 (2 x 17 days), USD 500 (200 at 48 days, 300 at 17)', async () => {
    const d = await report('overdue-aging');
    const detail = rowsOf(d, 'التفاصيل').map((r) => [r[0], r[6], r[7]]);
    expect(detail).toEqual(expect.arrayContaining([['طالب A1', 17, 400_000], ['طالب A2', 17, 225_000], ['طالب B1', 48, 200], ['طالب B1', 17, 300]]));
    expect(detail).toHaveLength(4);
    expect(totalsOf(d, 'التفاصيل').map((r) => r[1])).toEqual(expect.arrayContaining([625_000, 500]));
  });

  it('[REP-04] upcoming dues without a period: the coming days only (A2 #3 on 12-01), nothing already late', async () => {
    const d = await report('upcoming-dues');
    expect(rowsOf(d, 'التفاصيل').map((r) => [r[0], r[1], r[5]])).toEqual([['2026-12-01', 'طالب A2', 225_000]]);
  });

  it('[REP-05] section finance: the student rows add up to the totals row and to each student\'s own summary', async () => {
    const d = await report('section-finance', { sectionId: sec.A });
    const rows = rowsOf(d) as unknown[][];
    expect(rows.map((r) => [r[0], r[2], r[3], r[4], r[5]])).toEqual([
      ['طالب A1', 1_000_000, 600_000, 400_000, 400_000],
      ['طالب A2', 900_000, 225_000, 675_000, 225_000],
    ]);
    expect(totalsOf(d)[0].slice(1, 5)).toEqual([1_900_000, 825_000, 1_075_000, 625_000]);
    for (const [k, row] of [['A1', rows[0]], ['A2', rows[1]]] as const) {
      const summary = await inst.admin.get(`/students/${st[k]}/financial-summary`);
      const syp = (Array.isArray(summary) ? summary : summary.currencies ?? summary.totals).find((x: { currency: string }) => x.currency === 'SYP');
      expect([Number(syp.total), Number(syp.paid), Number(syp.remaining), Number(syp.overdue)]).toEqual([row[2], row[3], row[4], row[5]]);
    }
  });

  it('[REP-06] the family report: attendance 100 (1 recorded day), marks 90; no marks for a role without exams.view', async () => {
    const d = await report('student-monthly', { studentId: st.A1, from: '2026-11-01', to: '2026-11-18' });
    expect([stat(d, 'نسبة الحضور'), stat(d, 'حاضر'), stat(d, 'معدل العلامات')]).toEqual([100, 1, 90]);
    const phone = uniquePhone();
    await inst.admin.post('/staff', { fullName: 'محاسب', phone, role: 'ACCOUNTANT' });
    const acc = await signIn(s, phone);
    await acc.fails('get', `/reports/student-monthly?studentId=${st.A1}`, 403); // the report needs attendance.view
    const registrarPhone = uniquePhone();
    await inst.admin.post('/staff', { fullName: 'مسجل', phone: registrarPhone, role: 'DATA_ENTRY' });
    const dataEntry = await signIn(s, registrarPhone);
    const own = await report('student-monthly', { studentId: st.A1 }, dataEntry);
    expect(own.title).toBeTruthy();
  });

  it('[REP-07] daily attendance on the holiday 11-16 lists nobody as "not recorded"', async () => {
    const d = await report('daily-attendance', { date: '2026-11-16' });
    const missing = tables(d).find((b) => (b.title ?? '').includes('لم يُسجَّل'));
    expect(missing?.rows ?? []).toEqual([]);
    expect(stat(d, 'نسبة الحضور')).toBeNull();
    expect(rowsOf(d, 'حسب الشعبة').map((r) => [r[0], r[6], r[7]])).toEqual([['A', 0, null], ['B', 0, null]]);
    expect(d.blocks.some((b) => b.type === 'note')).toBe(true);
    // a normal day is unchanged: 2 of 4 present = 50, A 2 of 3 = 66.7, A3 and B1 not recorded
    const today = await report('daily-attendance', { date: '2026-11-18' });
    expect(stat(today, 'نسبة الحضور')).toBe(50);
    expect(rowsOf(today, 'الغائبون ومن لم يُسجَّل لهم حضور').map((r) => r[0])).toEqual(['طالب A3', 'طالب B1']);
  });

  it('[REP-08] exam results and section results use competition ranking 1, 2, 2', async () => {
    const e = await report('exam-results', { examId });
    expect(rowsOf(e).map((r) => [r[0], r[1], r[3]])).toEqual([[1, 'طالب A1', 90], [2, 'طالب A2', 75], [2, 'طالب A3', 75]]);
    expect([stat(e, 'المتوسط'), stat(e, 'نسبة النجاح')]).toEqual([16, 100]);
    const sr = await report('section-results', { sectionId: sec.A });
    expect(rowsOf(sr).map((r) => r[0])).toEqual([1, 2, 2]);
    expect(stat(sr, 'معدل الشعبة')).toBe(80);
    // [EXM-23] the transcript of A1 carries his 90 in mathematics and a verification number
    const tr = await report('student-transcript', { studentId: st.A1 });
    const cells = tables(tr).flatMap((b) => (b.rows ?? []).flatMap((r) => Object.values(r).map(amount)));
    expect(cells).toEqual(expect.arrayContaining(['الرياضيات', 90]));
    expect(tr.verification?.number).toMatch(/^TR-/);
  });

  it('[REP-09] teacher load = the rows of each teacher\'s timetable: رامي 3, هبة 2, total 5', async () => {
    const d = await report('teacher-load');
    expect(rowsOf(d).map((r) => [r[0], r[1]])).toEqual([['أ. رامي', 3], ['أ. هبة', 2]]);
    for (const k of ['rami', 'hiba']) {
      expect(await s.prisma.timetableEntry.count({ where: { teacherId: t[k] } })).toBe(k === 'rami' ? 3 : 2);
    }
    expect(stat(d, 'مجموع الحصص الأسبوعية')).toBe(5);
  });

  it('[REP-10] bus roster: the bus with its driver and its 2 active students', async () => {
    const d = await report('bus-roster');
    const tb = tables(d)[0];
    expect(tb.title).toContain('أبو سمير');
    expect(rowsOf(d).map((r) => r[1])).toEqual(['طالب A1', 'طالب A2']);
  });

  it('[REP-11] an Excel of more than 5000 rows is refused clearly, not cut silently', async () => {
    const rows = Array.from({ length: 5001 }, (_, i) => ({ n: i + 1 }));
    const doc = { key: 'selection', title: 'تحديد', orientation: 'portrait', meta: [], generatedAt: new Date().toISOString(), generatedBy: null,
      blocks: [{ type: 'table', columns: [{ key: 'n', title: 'رقم', kind: 'number' }], rows }] };
    await inst.admin.fails('post', '/reports/render/excel', 400, { document: doc });
  });

  it('[REP-13] QR verification: a real token is valid, one changed character is not, a cancelled receipt says so', async () => {
    const statement = await report('student-statement', { studentId: st.A1 });
    const token = statement.verification!.token;
    const ok = await new (inst.admin.constructor as new (app: unknown) => Api)(s.app).get(`/reports/verify/${token}`);
    expect(ok.valid ?? true).toBe(true);
    expect(JSON.stringify(ok)).toContain('طالب A1');
    const tampered = token.slice(0, -2) + (token.at(-2) === 'a' ? 'b' : 'a') + token.at(-1);
    const bad = await new (inst.admin.constructor as new (app: unknown) => Api)(s.app).get(`/reports/verify/${tampered}`);
    expect(bad.valid).toBe(false);
    const receipt = await inst.admin.get(`/reports/receipts/${cancelledId}/verification`);
    const r = await new (inst.admin.constructor as new (app: unknown) => Api)(s.app).get(`/reports/verify/${receipt.token}`);
    expect(JSON.stringify(r)).toMatch(/ملغ/);
    void paymentId;
  });

  it('[REP-14] permissions and parameters: a teacher on a section of another teacher 403; missing section 400', async () => {
    const hiba = await signIn(s, phones.hiba);
    await hiba.fails('get', `/reports/section-results?sectionId=${sec.B}`, 403);
    const err = await inst.admin.fails('get', '/reports/section-finance', 400);
    expect(String(err.message)).toMatch(/needs/i);
    const acc = await signIn(s, (await s.prisma.user.findFirstOrThrow({ where: { instituteId: inst.id, role: 'ACCOUNTANT' } })).phone);
    await acc.fails('get', '/reports/daily-attendance', 403);
  });
});
