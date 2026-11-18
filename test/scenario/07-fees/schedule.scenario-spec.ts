/**
 * [T1] 7.1 Building the installment schedule. Plan: docs/private/test-plan/07-fees-finance.md
 * Golden numbers (hand-computed from the rules, never recomputed here):
 *   1,500,000 - 100,000 = 1,400,000 / 8        -> 8 x 175,000
 *   1,000,000 / 3                              -> 333,333 + 333,333 + 333,334
 *   1,000,000, first 250,000, 3 installments   -> 250,000 then 3 x 250,000 (count excludes the first)
 *   600.00 USD / 7                             -> 6 x 85.71 + 85.74
 *   start 2027-01-31, 3 installments           -> 01-31, 02-28, 03-31
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { startApp, type ScenarioApp } from '../support/app';
import { InstituteFixture } from '../support/builders';
import { realClock, setClock } from '../support/clock';
import { installmentsInDb } from '../support/money';

describe('[T1] 7.1 installment schedule', () => {
  let s: ScenarioApp;
  let inst: InstituteFixture;
  let sypSection: number;
  let usdSection: number;
  let seq = 0;

  /** A fresh student enrolled in the section (one enrollment = at most one contract). */
  const enrollment = async (sectionId: number) => {
    seq += 1;
    const st = await inst.student({ fullName: `طالب الجدول ${seq}`, sectionId, newFamily: { familyName: `عائلة ${seq}` } });
    return inst.enrollmentOf(st.id);
  };

  beforeAll(async () => {
    setClock('2026-09-01 09:00');
    s = await startApp();
    inst = await InstituteFixture.create(s, 'جدول الأقساط');
    const ab = await inst.anyAcademicBranch();
    sypSection = await inst.section({ name: 'التاسع - أ', academicBranchId: ab, fee: 1_500_000 });
    usdSection = await inst.section({ name: 'شعبة الدولار', academicBranchId: ab, fee: 600, currency: 'USD' });
  });

  afterAll(async () => {
    realClock();
    await s?.close();
  });

  it('[FEE-01] section fee 1,500,000 with a 100,000 discount over 8 months = 8 x 175,000 from the start date', async () => {
    const e = await enrollment(sypSection);
    const c = await inst.admin.post(`/enrollments/${e}/contract`, {
      discountAmount: 100_000, discountReason: 'حسم الإخوة', numberOfInstallments: 8, startDate: '2026-09-01',
    });
    expect(Number(c.totalAmount ?? c.total)).toBe(1_400_000);
    expect(await installmentsInDb(s.prisma, c.id)).toEqual(
      ['2026-09-01', '2026-10-01', '2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01', '2027-03-01', '2027-04-01'].map(
        (dueDate, i) => ({ installmentNumber: i + 1, amount: 175_000, paid: 0, status: 'PENDING', dueDate }),
      ),
    );
  });

  it('[FEE-02] 1,000,000 over 3 puts the whole remainder on the LAST installment', async () => {
    const e = await enrollment(sypSection);
    const c = await inst.admin.post(`/enrollments/${e}/contract`, { grossAmount: 1_000_000, numberOfInstallments: 3, startDate: '2026-09-01' });
    expect((await installmentsInDb(s.prisma, c.id)).map((i) => i.amount)).toEqual([333_333, 333_333, 333_334]);
  });

  it('[FEE-03] a first payment is installment #1 on the start date; the 3 others start one month later', async () => {
    const e = await enrollment(sypSection);
    const c = await inst.admin.post(`/enrollments/${e}/contract`, {
      grossAmount: 1_000_000, firstPaymentAmount: 250_000, numberOfInstallments: 3, startDate: '2026-09-01',
    });
    expect((await installmentsInDb(s.prisma, c.id)).map((i) => [i.installmentNumber, i.amount, i.dueDate])).toEqual([
      [1, 250_000, '2026-09-01'],
      [2, 250_000, '2026-10-01'],
      [3, 250_000, '2026-11-01'],
      [4, 250_000, '2026-12-01'],
    ]);
  });

  it('[FEE-04] a USD contract of 600.00 over 7 = 6 x 85.71 + 85.74 (split in cents)', async () => {
    const e = await enrollment(usdSection);
    const c = await inst.admin.post(`/enrollments/${e}/contract`, { numberOfInstallments: 7, startDate: '2026-09-01' });
    expect(c.currency).toBe('USD');
    const amounts = (await installmentsInDb(s.prisma, c.id)).map((i) => i.amount);
    expect(amounts).toEqual([85.71, 85.71, 85.71, 85.71, 85.71, 85.71, 85.74]);
    expect(Math.round(amounts.reduce((a, b) => a + b, 0) * 100)).toBe(60_000);
  });

  it('[FEE-05] a start on the 31st is clamped to the month length: 01-31, 02-28, 03-31', async () => {
    const e = await enrollment(sypSection);
    const c = await inst.admin.post(`/enrollments/${e}/contract`, { grossAmount: 300_000, numberOfInstallments: 3, startDate: '2027-01-31' });
    expect((await installmentsInDb(s.prisma, c.id)).map((i) => i.dueDate)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
  });

  it('[FEE-06] impossible schedules are refused and write nothing', async () => {
    const e = await enrollment(sypSection);
    const before = await s.prisma.studentSubscription.count({ where: { enrollmentId: e } });
    const path = `/enrollments/${e}/contract`;
    await inst.admin.fails('post', path, 400, { discountAmount: 1_500_001, numberOfInstallments: 3 });
    await inst.admin.fails('post', path, 400, { grossAmount: 1_000_000, firstPaymentAmount: 1_000_000, numberOfInstallments: 3 });
    await inst.admin.fails('post', path, 400, { numberOfInstallments: 0 });
    await inst.admin.fails('post', path, 400, { numberOfInstallments: 61 });
    expect(await s.prisma.studentSubscription.count({ where: { enrollmentId: e } })).toBe(before);
  });

  it('[FEE-07] one contract per enrollment; none for an enrollment that is not ACTIVE', async () => {
    const e = await enrollment(sypSection);
    await inst.admin.post(`/enrollments/${e}/contract`, { numberOfInstallments: 2 });
    const dup = await inst.admin.fails('post', `/enrollments/${e}/contract`, 400, { numberOfInstallments: 2 });
    expect(dup.message).toBe('This enrollment already has a contract');
    expect(await s.prisma.studentSubscription.count({ where: { enrollmentId: e } })).toBe(1);

    const st = await inst.student({ fullName: 'طالب منسحب', sectionId: sypSection, newFamily: { familyName: 'المنسحب' } });
    const withdrawn = await inst.enrollmentOf(st.id);
    await inst.admin.patch(`/enrollments/${withdrawn}/status`, { status: 'WITHDRAWN', reason: 'انتقل لمعهد آخر' });
    const err = await inst.admin.fails('post', `/enrollments/${withdrawn}/contract`, 400, { numberOfInstallments: 2 });
    expect(err.message).toBe('A contract can only be created for an active enrollment');
  });

  it('[FEE-08] preview returns exactly what create will save, and saves nothing', async () => {
    const e = await enrollment(sypSection);
    const body = { discountAmount: 50_000, numberOfInstallments: 4, startDate: '2026-09-15' };
    const preview = await inst.admin.post(`/enrollments/${e}/contract/preview`, body);
    expect(await s.prisma.studentSubscription.count({ where: { enrollmentId: e } })).toBe(0);
    const c = await inst.admin.post(`/enrollments/${e}/contract`, body);
    const saved = (await installmentsInDb(s.prisma, c.id)).map((i) => [i.amount, i.dueDate]);
    const previewed = (preview.installments ?? preview.schedule).map((i: { amount: unknown; dueDate: string }) => [Number(i.amount), String(i.dueDate).slice(0, 10)]);
    expect(previewed).toEqual(saved);
    expect(saved.map(([a]) => a)).toEqual([362_500, 362_500, 362_500, 362_500]);
  });

  it('[FEE-09] without amount or currency the contract takes the section fee and currency', async () => {
    const e = await enrollment(usdSection);
    const c = await inst.admin.post(`/enrollments/${e}/contract`, { numberOfInstallments: 1 });
    expect([c.currency, Number(c.totalAmount ?? c.total)]).toEqual(['USD', 600]);
  });
});
