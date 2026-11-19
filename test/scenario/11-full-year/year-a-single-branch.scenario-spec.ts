/**
 * [T8] YEAR-A: a one-branch institute in pounds, September 2026 -> June 2027. Plan: 11-full-year-scenarios.md
 * Every month ends with the reconciliation (support/reconcile.ts): the same number from every place.
 *
 * 3 sections (A, B, C), 6 subjects, 4 teachers, generated timetable.
 * 40 students (s0..s39) in 25 families: family 0 = s0, s1, s2; families 1..13 = pairs s3..s28; 14..24 = s29..s39.
 * Section of s_i = i % 3. Contracts 1,500,000, 8 monthly installments from 2026-09-01 (Sep..Apr):
 *   i % 4 = 0 -> discount 150,000 -> 8 x 168,750 ; i % 4 = 1 -> 100,000 -> 8 x 175,000 ; else 8 x 187,500
 * Every payer pays his oldest open installment on the 5th of each month (Sep..Apr), except:
 *   s5, s6, s7 pay September only (late payers); s9 withdraws on 11-10 after 3 payments (contract stays open);
 *   s34..s39 skip April; family 0 pays December for its three children in one family payment;
 *   s15 pays a wrong extra 50,000 on 11-06, cancelled on 11-07; s12 gets 70,000 more discount on 12-08;
 *   s3 moves from section A to B on 11-15 (same enrollment and contract).
 * June: everyone except those 10 pays what is left -> 30 contracts COMPLETED; then all enrollments COMPLETED.
 * Golden remaining of the 10 (hand-computed from the installments, never recomputed by the test):
 *   s5 1,225,000 ; s6 1,312,500 ; s7 1,312,500 ; s9 875,000 ;
 *   s34 187,500 ; s35 187,500 ; s36 168,750 ; s37 175,000 ; s38 187,500 ; s39 187,500
 * Attendance on the 10th and 20th (the next day when Friday): s_i absent when (i + day) % 9 = 0,
 *   late when (i + day) % 7 = 0, else present. Institute closure 11-24, closure of section C on 12-15.
 * Exams: mathematics /20 in every section on the 12th, Oct..May; mark of s_i = 8 + (7i + month) % 13.
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { AttendanceProcessor } from '../../../src/modules/attendance/jobs/attendance.processor';
import { startApp, type ScenarioApp } from '../support/app';
import { InstituteFixture, signIn } from '../support/builders';
import { type Api, uniquePhone } from '../support/client';
import { realClock, setClock } from '../support/clock';
import { reconcile } from '../support/reconcile';

const N = 40;
const LATE_PAYERS = [5, 6, 7];
const WITHDRAWN = 9;
const SKIP_APRIL = [34, 35, 36, 37, 38, 39];
const GOLDEN_REMAINING: Record<number, number> = {
  5: 1_225_000, 6: 1_312_500, 7: 1_312_500, 9: 875_000,
  34: 187_500, 35: 187_500, 36: 168_750, 37: 175_000, 38: 187_500, 39: 187_500,
};
const MONTHS: [number, number][] = [[2026, 9], [2026, 10], [2026, 11], [2026, 12], [2027, 1], [2027, 2], [2027, 3], [2027, 4], [2027, 5], [2027, 6]];

const pad = (v: number) => String(v).padStart(2, '0');
/** The date, or the next day when it is a Friday (no school). */
const schoolDay = (y: number, m: number, d: number) => {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCDay() === 5) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};

describe('[T8] YEAR-A one branch, pounds, a whole year', () => {
  let s: ScenarioApp;
  let inst: InstituteFixture;
  const sections: number[] = [];
  const subj: Record<string, number> = {};
  const st: number[] = [];
  const familyOf: number[] = [];
  const familyLogin: Api[] = [];
  const contractOf: number[] = [];
  const sectionOf: number[] = [];
  const left = new Set<number>(); // withdrawn

  const reconcileNow = async (today: string) =>
    reconcile({
      inst, today, yearStart: '2026-09-01',
      students: st.map((id, i) => ({ id, family: familyLogin[familyOf[i]] })),
      sections,
    });

  const payOldest = async (i: number) => {
    const open = await s.prisma.installment.findFirst({ where: { subscriptionId: contractOf[i], status: { not: 'PAID' } }, orderBy: { installmentNumber: 'asc' } });
    if (!open) return;
    await inst.admin.post(`/contracts/${contractOf[i]}/payments`, { amount: Number(open.amount) - Number(open.paidAmount) });
  };

  const attendanceDay = async (date: string) => {
    const day = Number(date.slice(8));
    const status = (i: number) => ((i + day) % 9 === 0 ? 'ABSENT' : (i + day) % 7 === 0 ? 'LATE' : 'PRESENT');
    setClock(`${date} 07:55`);
    for (const [k, sectionId] of sections.entries()) {
      const ids = st.filter((_, i) => sectionOf[i] === k && !left.has(i) && status(i) === 'PRESENT');
      if (ids.length) await inst.admin.post('/attendance/bulk', { sectionId, action: 'check-in', studentIds: ids });
    }
    setClock(`${date} 08:30`);
    for (const [i, id] of st.entries()) if (!left.has(i) && status(i) === 'LATE') await inst.admin.post('/attendance/check-in', { studentId: id });
    setClock(`${date} 14:00`);
    await s.runJob(AttendanceProcessor, 'mark-absences', inst.id);
  };

  const examMonth = async (y: number, m: number) => {
    const date = schoolDay(y, m, 12);
    setClock(`${date} 09:00`);
    for (const [k, sectionId] of sections.entries()) {
      const exam = await inst.admin.post('/exams', { sectionId, subjectId: subj.math, title: `رياضيات ${y}-${pad(m)}`, examDate: date, maxMark: 20, passMark: 10 });
      const results = st.flatMap((id, i) => (sectionOf[i] === k && !left.has(i) ? [{ studentId: id, mark: 8 + ((7 * i + m) % 13) }] : []));
      await inst.admin.put(`/exams/${exam.id}/results`, { results });
    }
  };

  beforeAll(async () => {
    setClock('2026-09-01 08:00');
    s = await startApp();
    inst = await InstituteFixture.create(s, 'السنة الكاملة أ');
    const ab = await inst.anyAcademicBranch();
    const names = { math: 'الرياضيات', phys: 'الفيزياء', chem: 'الكيمياء', ar: 'العربي', en: 'الإنكليزي', fr: 'الفرنسي' };
    for (const [k, v] of Object.entries(names)) subj[k] = await inst.subject(v);
    const teacher = async (name: string, subjects: string[]) => {
      const row = await inst.admin.post('/teachers', { fullName: name, phone: uniquePhone(), branchIds: [inst.branchId], qualifications: subjects.map((x) => ({ academicBranchId: ab, subjectId: subj[x] })) });
      return row.id ?? row.teacher?.id;
    };
    const t = [await teacher('أ. رامي', ['math']), await teacher('أ. هبة', ['phys', 'chem']), await teacher('أ. محمود', ['ar']), await teacher('أ. لينا', ['en', 'fr'])];
    const plan: [string, number, number][] = [['math', 5, 0], ['phys', 3, 1], ['chem', 2, 1], ['ar', 5, 2], ['en', 4, 3], ['fr', 2, 3]];
    for (const name of ['A', 'B', 'C']) {
      const id = await inst.section({ name, academicBranchId: ab, fee: 1_500_000 });
      sections.push(id);
      for (const [x, periods, who] of plan) await inst.admin.post(`/sections/${id}/subjects`, { subjectId: subj[x], weeklyPeriods: periods, teacherId: t[who] });
    }
    for (let n = 0; n < 3; n++) await inst.admin.post('/rooms', { name: `قاعة ${n + 1}`, capacity: 30, branchId: inst.branchId });

    const familyIds: number[] = [];
    const familyPhones: string[] = [];
    for (let i = 0; i < N; i++) {
      const fam = i < 3 ? 0 : i < 29 ? 1 + Math.floor((i - 3) / 2) : 14 + (i - 29);
      familyOf.push(fam);
      sectionOf.push(i % 3);
      const input = { fullName: `طالب ${i}`, gender: (i % 2 ? 'FEMALE' : 'MALE') as 'MALE' | 'FEMALE', sectionId: sections[i % 3] };
      if (familyIds[fam] === undefined) {
        familyPhones[fam] = uniquePhone();
        const row = await inst.student({ ...input, newFamily: { familyName: `عائلة ${fam}`, fatherName: 'الأب', phone: familyPhones[fam] } });
        familyIds[fam] = row.familyId;
        st.push(row.id);
      } else {
        st.push((await inst.student({ ...input, familyId: familyIds[fam] })).id);
      }
    }
    for (const [fam, phone] of familyPhones.entries()) familyLogin[fam] = await signIn(s, phone);
    (globalThis as { __yearAFamilies?: number[] }).__yearAFamilies = familyIds;
  });

  afterAll(async () => {
    realClock();
    await s?.close();
  });

  it('[YEAR-A 09] September: timetable without hard conflicts, 40 contracts, receipts 1..N, reconciled', async () => {
    await inst.admin.post(`/academic-years/${inst.yearId}/timetable/generate`, {});
    for (const sectionId of sections) {
      const tid = (await s.prisma.timetable.findFirstOrThrow({ where: { sectionId } })).id;
      const conflicts: { severity: string }[] = await inst.admin.get(`/timetables/${tid}/conflicts`);
      expect(conflicts.filter((c) => c.severity === 'HARD')).toEqual([]);
      expect(await s.prisma.timetableEntry.count({ where: { timetableId: tid } })).toBe(21);
    }
    for (let i = 0; i < N; i++) {
      const discount = i % 4 === 0 ? 150_000 : i % 4 === 1 ? 100_000 : 0;
      contractOf[i] = (await inst.admin.post(`/enrollments/${await inst.enrollmentOf(st[i])}/contract`, {
        numberOfInstallments: 8, startDate: '2026-09-01', ...(discount && { discountAmount: discount, discountReason: 'حسم' }),
      })).id;
    }
    const amounts = await s.prisma.installment.groupBy({ by: ['amount'], where: { instituteId: inst.id }, _count: true });
    expect(Object.fromEntries(amounts.map((a) => [Number(a.amount), a._count]))).toEqual({ 168_750: 80, 175_000: 80, 187_500: 160 });
    setClock('2026-09-05 09:00');
    for (let i = 0; i < N; i++) await payOldest(i);
    expect((await s.prisma.payment.findMany({ where: { instituteId: inst.id }, orderBy: { receiptNumber: 'asc' } })).map((p) => p.receiptNumber)).toEqual(Array.from({ length: N }, (_, k) => k + 1));
    await attendanceDay(schoolDay(2026, 9, 10));
    await attendanceDay(schoolDay(2026, 9, 20));
    setClock('2026-09-28 20:00');
    expect(await reconcileNow('2026-09-28')).toEqual([]);
  });

  /** One ordinary month: payments on the 5th, attendance on the 10th and 20th, an exam on the 12th. */
  const ordinaryMonth = async (y: number, m: number, hooks: { beforePay?: () => Promise<void>; afterPay?: () => Promise<void>; afterDay10?: () => Promise<void>; end?: () => Promise<void> } = {}) => {
    await hooks.beforePay?.();
    setClock(`${y}-${pad(m)}-05 09:00`);
    if (m <= 4 || m >= 10) {
      for (let i = 0; i < N; i++) {
        if (LATE_PAYERS.includes(i) || left.has(i)) continue;
        if (m === 4 && SKIP_APRIL.includes(i)) continue;
        if (m === 12 && i < 3) continue; // family 0 pays December together
        await payOldest(i);
      }
    }
    await hooks.afterPay?.();
    await attendanceDay(schoolDay(y, m, 10));
    await hooks.afterDay10?.();
    if (m >= 10 || m <= 5) await examMonth(y, m);
    await attendanceDay(schoolDay(y, m, 20));
    await hooks.end?.();
    setClock(`${y}-${pad(m)}-28 20:00`);
    return reconcileNow(`${y}-${pad(m)}-28`);
  };

  it('[YEAR-A 10] October: three late payers become overdue; reconciled', async () => {
    expect(await ordinaryMonth(2026, 10)).toEqual([]);
    const summary = await inst.admin.get(`/students/${st[5]}/financial-summary`);
    const syp = (Array.isArray(summary) ? summary : summary.currencies ?? summary.totals).find((r: { currency: string }) => r.currency === 'SYP');
    expect([Number(syp.paid), Number(syp.overdue)]).toEqual([175_000, 175_000]);
  });

  it('[YEAR-A 11] November: a withdrawal, a transfer, a cancelled payment, a holiday; reconciled', async () => {
    const issues = await ordinaryMonth(2026, 11, {
      beforePay: async () => {
        setClock('2026-11-01 08:00');
        await inst.admin.post('/closures', { scope: 'INSTITUTE', fromDate: '2026-11-24', toDate: '2026-11-24', reason: 'عطلة' });
      },
      afterPay: async () => {
        setClock('2026-11-06 10:00');
        const wrong = await inst.admin.post(`/contracts/${contractOf[15]}/payments`, { amount: 50_000 });
        setClock('2026-11-07 10:00');
        await inst.admin.patch(`/payments/${wrong.id}/cancel`, { reason: 'دفعة مكررة' });
      },
      afterDay10: async () => {
        setClock('2026-11-10 15:00');
        await inst.admin.patch(`/enrollments/${await inst.enrollmentOf(st[WITHDRAWN])}/status`, { status: 'WITHDRAWN', reason: 'سفر' });
        left.add(WITHDRAWN);
        setClock('2026-11-15 10:00');
        const enr = (await s.prisma.studentEnrollment.findFirstOrThrow({ where: { studentId: st[3] } })).id;
        await inst.admin.patch(`/enrollments/${enr}/transfer`, { sectionId: sections[1] });
        sectionOf[3] = 1;
      },
    });
    expect(issues).toEqual([]);
    // the transferred student keeps his enrollment and contract
    const contract = await s.prisma.studentSubscription.findUniqueOrThrow({ where: { id: contractOf[3] } });
    const enrollment = await s.prisma.studentEnrollment.findFirstOrThrow({ where: { studentId: st[3] } });
    expect([contract.enrollmentId, enrollment.sectionId]).toEqual([enrollment.id, sections[1]]);
    // the withdrawn student: no attendance and no mark after 11-10
    expect(await s.prisma.dailyAttendance.count({ where: { studentId: st[WITHDRAWN], date: { gt: new Date('2026-11-10') } } })).toBe(0);
    expect(await s.prisma.examResult.count({ where: { studentId: st[WITHDRAWN], exam: { examDate: { gt: new Date('2026-11-10') } } } })).toBe(0);
    expect(await s.prisma.dailyAttendance.count({ where: { instituteId: inst.id, date: new Date('2026-11-24') } })).toBe(0);
    // the cancelled payment left s15 exactly as before (3 installments paid)
    const s15 = await s.prisma.installment.findMany({ where: { subscriptionId: contractOf[15] }, orderBy: { installmentNumber: 'asc' } });
    expect(s15.map((x) => x.status).slice(0, 3)).toEqual(['PAID', 'PAID', 'PAID']);
    expect(Number(s15[3].paidAmount)).toBe(0);
  });

  it('[YEAR-A 12] December: a contract edit re-spreads, a family payment of three children, a section holiday; reconciled', async () => {
    const families = (globalThis as { __yearAFamilies?: number[] }).__yearAFamilies!;
    const issues = await ordinaryMonth(2026, 12, {
      beforePay: async () => {
        setClock('2026-12-01 08:00');
        await inst.admin.post('/closures', { scope: 'SECTION', sectionIds: [sections[2]], fromDate: '2026-12-15', toDate: '2026-12-15', reason: 'رحلة' });
      },
      afterPay: async () => {
        const amounts: number[] = [];
        for (const i of [0, 1, 2]) {
          const open = await s.prisma.installment.findFirstOrThrow({ where: { subscriptionId: contractOf[i], status: { not: 'PAID' } }, orderBy: { installmentNumber: 'asc' } });
          amounts.push(Number(open.amount) - Number(open.paidAmount));
        }
        const before = await s.prisma.payment.count({ where: { instituteId: inst.id } });
        const paid = await inst.admin.post(`/families/${families[0]}/payments`, { payments: [0, 1, 2].map((i, k) => ({ contractId: contractOf[i], amount: amounts[k] })), paymentMethod: 'CASH' });
        expect(paid).toHaveLength(3);
        expect(paid.map((p: { receiptNumber: number }) => p.receiptNumber)).toEqual([before + 1, before + 2, before + 3]);
        setClock('2026-12-08 10:00');
        await inst.admin.patch(`/contracts/${contractOf[12]}`, { discountAmount: 220_000 });
      },
    });
    expect(issues).toEqual([]);
    // s12: 1,280,000 now; 4 installments paid (675,000), the 4 others share 605,000 (151,250 each)
    const s12 = await s.prisma.installment.findMany({ where: { subscriptionId: contractOf[12] }, orderBy: { installmentNumber: 'asc' } });
    expect(s12.map((x) => Number(x.amount))).toEqual([168_750, 168_750, 168_750, 168_750, 151_250, 151_250, 151_250, 151_250]);
    expect(await s.prisma.dailyAttendance.count({ where: { instituteId: inst.id, date: new Date('2026-12-15') } })).toBe(0);
  });

  it('[YEAR-A 01..05] January to May: attendance, exams, payments; every month reconciled', async () => {
    for (const [y, m] of MONTHS.slice(4, 9)) {
      const issues = await ordinaryMonth(y, m);
      expect([`${y}-${m}`, issues]).toEqual([`${y}-${m}`, []]);
    }
  }, 600_000);

  it('[YEAR-A 06] June: 30 contracts completed, the 10 others owe exactly the golden amounts; end-of-year reports', async () => {
    setClock('2027-06-05 09:00');
    for (let i = 0; i < N; i++) {
      if (i in GOLDEN_REMAINING) continue;
      const c = await s.prisma.studentSubscription.findUniqueOrThrow({ where: { id: contractOf[i] }, include: { installments: true } });
      const remaining = c.installments.reduce((sum, x) => sum + Number(x.amount) - Number(x.paidAmount), 0);
      if (remaining > 0) await inst.admin.post(`/contracts/${contractOf[i]}/payments`, { amount: remaining });
    }
    setClock('2027-06-28 20:00');
    expect(await reconcileNow('2027-06-28')).toEqual([]);

    const contracts = await s.prisma.studentSubscription.findMany({ where: { instituteId: inst.id }, include: { installments: true } });
    expect(contracts.filter((c) => c.status === 'COMPLETED')).toHaveLength(30);
    const owed = Object.fromEntries(
      contracts.filter((c) => c.status !== 'COMPLETED').map((c) => [st.indexOf(c.studentId), c.installments.reduce((sum, x) => sum + Number(x.amount) - Number(x.paidAmount), 0)]),
    );
    expect(owed).toEqual(GOLDEN_REMAINING);

    for (let i = 0; i < N; i++) {
      if (left.has(i)) continue;
      await inst.admin.patch(`/enrollments/${await inst.enrollmentOf(st[i])}/status`, { status: 'COMPLETED' });
    }
    const stats = await inst.admin.get('/reports/enrollment-stats');
    const stat = (label: string) => stats.blocks.filter((b: { type: string }) => b.type === 'stats').flatMap((b: { items: { label: string; value: unknown }[] }) => b.items).find((x: { label: string }) => x.label === label)?.value;
    expect([stat('الطلاب الفعالون'), stat('منسحبون')]).toEqual([0, 1]);
    const aging = await inst.admin.get('/reports/overdue-aging');
    const detail = aging.blocks.find((b: { title?: string }) => b.title === 'التفاصيل');
    const owedByAging = new Map<string, number>();
    for (const r of detail.rows) owedByAging.set(r.student, (owedByAging.get(r.student) ?? 0) + r.amount.amount);
    expect(Object.fromEntries(owedByAging)).toEqual(Object.fromEntries(Object.entries(GOLDEN_REMAINING).map(([i, v]) => [`طالب ${i}`, v])));
  });
});
