/**
 * [T1] 7.2 Payments, FIFO allocation, overdue and aging. Plan: 07-fees-finance.md
 * Contract: 1,000,000 SYP / 3 = 333,333 (09-01), 333,333 (10-01), 333,334 (11-01).
 * Golden numbers:
 *   pay 500,000 on 09-05 -> #1 paid 333,333 PAID, #2 paid 166,667 PARTIAL, #3 0
 *   on 11-18: total 1,000,000 / paid 500,000 / remaining 500,000 / overdue 500,000
 *   aging on 11-18: #3 333,334 is 17 days late (1-30), #2 166,666 is 48 days late (31-60)
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { startApp, type ScenarioApp } from '../support/app';
import { InstituteFixture } from '../support/builders';
import { realClock, setClock } from '../support/clock';
import { expectAllocationsMatchPaid, expectPerCurrency, installmentsInDb, num } from '../support/money';

describe('[T1] 7.2 payments and FIFO allocation', () => {
  let s: ScenarioApp;
  let inst: InstituteFixture;
  let studentId: number;
  let contractId: number;

  beforeAll(async () => {
    setClock('2026-09-01 09:00');
    s = await startApp();
    inst = await InstituteFixture.create(s, 'الدفعات');
    const section = await inst.section({ name: 'التاسع - أ', academicBranchId: await inst.anyAcademicBranch(), fee: 1_000_000 });
    studentId = (await inst.student({ fullName: 'يزن الخطيب', sectionId: section, newFamily: { familyName: 'الخطيب' } })).id;
    const c = await inst.admin.post(`/enrollments/${await inst.enrollmentOf(studentId)}/contract`, {
      numberOfInstallments: 3, startDate: '2026-09-01',
    });
    contractId = c.id;
  });

  afterAll(async () => {
    realClock();
    await s?.close();
  });

  it('[FEE-10] 500,000 on 09-05 fills #1 and part of #2 (FIFO by due date), receipt 1', async () => {
    setClock('2026-09-05 10:00');
    const p = await inst.admin.post(`/contracts/${contractId}/payments`, { amount: 500_000, paymentMethod: 'CASH' });
    expect(p.receiptNumber).toBe(1);
    expect(num(p.appliedAmount)).toBe(500_000);
    expect((await installmentsInDb(s.prisma, contractId)).map((i) => [i.installmentNumber, i.paid, i.status])).toEqual([
      [1, 333_333, 'PAID'],
      [2, 166_667, 'PARTIAL'],
      [3, 0, 'PENDING'],
    ]);
    const allocations = await s.prisma.paymentAllocation.findMany({ where: { paymentId: p.id }, orderBy: { id: 'asc' } });
    expect(allocations.map((a) => num(a.amount))).toEqual([333_333, 166_667]);
    expect((await s.prisma.studentSubscription.findUniqueOrThrow({ where: { id: contractId } })).status).toBe('ACTIVE');
    await expectAllocationsMatchPaid(s.prisma, contractId);
  });

  it('[FEE-11] one pound more than the remaining is refused and consumes no receipt number', async () => {
    const err = await inst.admin.fails('post', `/contracts/${contractId}/payments`, 400, { amount: 500_001 });
    expect(JSON.stringify(err)).toMatch(/remaining|exceeds/i);
    expect(await s.prisma.payment.count({ where: { subscriptionId: contractId } })).toBe(1);
  });

  it('[FEE-12] on 11-18 the summary is 1,000,000 / 500,000 / 500,000 with 500,000 overdue', async () => {
    setClock('2026-11-18 10:00');
    const rows = await inst.admin.get(`/students/${studentId}/financial-summary`);
    expectPerCurrency(Array.isArray(rows) ? rows : rows.currencies ?? rows.totals, {
      SYP: { total: 1_000_000, paid: 500_000, remaining: 500_000, overdue: 500_000 },
    });
  });

  it('[FEE-13] statuses are computed for today: #2 and #3 overdue; an installment due TODAY is not overdue', async () => {
    const contract = await inst.admin.get(`/contracts/${contractId}`);
    expect(contract.installments.map((i: { installmentNumber: number; status: string }) => [i.installmentNumber, i.status])).toEqual([
      [1, 'PAID'],
      [2, 'OVERDUE'],
      [3, 'OVERDUE'],
    ]);
    // Due-today rule: a second contract whose first installment falls on 11-18
    const section = await s.prisma.section.findFirstOrThrow({ where: { instituteId: inst.id } });
    const st = await inst.student({ fullName: 'جود الزعبي', gender: 'FEMALE', sectionId: section.id, newFamily: { familyName: 'الزعبي' } });
    const c2 = await inst.admin.post(`/enrollments/${await inst.enrollmentOf(st.id)}/contract`, {
      grossAmount: 200_000, numberOfInstallments: 2, startDate: '2026-11-18',
    });
    const summary = await inst.admin.get(`/students/${st.id}/financial-summary`);
    expectPerCurrency(Array.isArray(summary) ? summary : summary.currencies ?? summary.totals, {
      SYP: { total: 200_000, paid: 0, remaining: 200_000, overdue: 0 },
    });
    expect((await inst.admin.get(`/contracts/${c2.id}`)).installments[0].status).not.toBe('OVERDUE');
  });

  it('[FEE-14] aging on 11-18: 333,334 in 1-30 days, 166,666 in 31-60, nothing older', async () => {
    const aging: { currency: string; bucket: string; count: number; amount: unknown }[] =
      await inst.admin.get('/installments/overdue/summary');
    const syp = aging.filter((r) => r.currency === 'SYP' && num(r.amount) > 0).map((r) => [r.bucket, r.count, num(r.amount)]);
    expect(syp).toEqual([
      ['1-30', 1, 333_334],
      ['31-60', 1, 166_666],
    ]);
    expect(aging.every((r) => r.currency === 'SYP')).toBe(true);
  });

  it('[FEE-15] paying the last 500,000 completes the contract: receipt 2, all PAID, nothing left', async () => {
    const p = await inst.admin.post(`/contracts/${contractId}/payments`, { amount: 500_000 });
    expect(p.receiptNumber).toBe(2);
    expect((await installmentsInDb(s.prisma, contractId)).map((i) => [i.paid, i.status])).toEqual([
      [333_333, 'PAID'],
      [333_333, 'PAID'],
      [333_334, 'PAID'],
    ]);
    expect((await s.prisma.studentSubscription.findUniqueOrThrow({ where: { id: contractId } })).status).toBe('COMPLETED');
    const rows = await inst.admin.get(`/students/${studentId}/financial-summary`);
    expectPerCurrency(Array.isArray(rows) ? rows : rows.currencies ?? rows.totals, {
      SYP: { total: 1_000_000, paid: 1_000_000, remaining: 0, overdue: 0 },
    });
    await expectAllocationsMatchPaid(s.prisma, contractId);
  });

  it('[FEE-16] a completed contract takes no more money', async () => {
    await inst.admin.fails('post', `/contracts/${contractId}/payments`, 400, { amount: 1 });
    expect(await s.prisma.payment.count({ where: { subscriptionId: contractId } })).toBe(2);
  });
});
