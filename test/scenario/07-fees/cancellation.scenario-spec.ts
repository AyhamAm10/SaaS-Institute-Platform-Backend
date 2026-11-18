/**
 * [T1] 7.5 Cancelling a payment. Plan: 07-fees-finance.md.
 * Contract 1,000,000 / 3 (09-01, 10-01, 11-01); 500,000 paid on 09-05 (#1 PAID, #2 PARTIAL).
 * Cancelled on 11-18: every paid amount goes back to 0 and statuses are recomputed
 * for 11-18, so all three installments become OVERDUE. The payment row, its
 * allocations and its receipt number stay.
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { startApp, type ScenarioApp } from '../support/app';
import { InstituteFixture } from '../support/builders';
import { realClock, setClock } from '../support/clock';
import { expectAllocationsMatchPaid, expectPerCurrency, installmentsInDb, num } from '../support/money';

describe('[T1] 7.5 payment cancellation', () => {
  let s: ScenarioApp;
  let inst: InstituteFixture;
  let studentId: number;
  let contractId: number;
  let paymentId: number;

  beforeAll(async () => {
    setClock('2026-09-01 09:00');
    s = await startApp();
    inst = await InstituteFixture.create(s, 'الإلغاء');
    const section = await inst.section({ name: 'التاسع - أ', academicBranchId: await inst.anyAcademicBranch(), fee: 1_000_000 });
    studentId = (await inst.student({ fullName: 'عمر العمر', sectionId: section, newFamily: { familyName: 'العمر' } })).id;
    contractId = (await inst.admin.post(`/enrollments/${await inst.enrollmentOf(studentId)}/contract`, { numberOfInstallments: 3, startDate: '2026-09-01' })).id;
    setClock('2026-09-05 10:00');
    paymentId = (await inst.admin.post(`/contracts/${contractId}/payments`, { amount: 500_000 })).id;
  });

  afterAll(async () => {
    realClock();
    await s?.close();
  });

  it('[FEE-40] a cancellation needs a reason', async () => {
    setClock('2026-11-18 10:00');
    await inst.admin.fails('patch', `/payments/${paymentId}/cancel`, 400, { reason: '' });
    await inst.admin.fails('patch', `/payments/${paymentId}/cancel`, 400, {});
    expect((await s.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })).status).toBe('ACTIVE');
  });

  it('[FEE-41] cancelling on 11-18 returns every amount and recomputes the statuses for that day', async () => {
    await inst.admin.patch(`/payments/${paymentId}/cancel`, { reason: 'إيصال خاطئ' });
    // Stored: the installments the payment touched (#1, #2) are recomputed; #3 waits for the hourly job
    expect((await installmentsInDb(s.prisma, contractId)).map((i) => [i.paid, i.status])).toEqual([
      [0, 'OVERDUE'],
      [0, 'OVERDUE'],
      [0, 'PENDING'],
    ]);
    // Read through the API: always computed for today, so every screen shows the truth at once
    const live = await inst.admin.get(`/contracts/${contractId}`);
    expect(live.installments.map((i: { status: string }) => i.status)).toEqual(['OVERDUE', 'OVERDUE', 'OVERDUE']);
    const row = await s.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect([row.status, row.cancelReason, row.receiptNumber, row.cancelledAt?.toISOString()]).toEqual([
      'CANCELLED', 'إيصال خاطئ', 1, '2026-11-18T07:00:00.000Z',
    ]);
    expect(await s.prisma.paymentAllocation.count({ where: { paymentId } })).toBe(2);
    await expectAllocationsMatchPaid(s.prisma, contractId);
    expectPerCurrency(await inst.admin.get(`/students/${studentId}/financial-summary`), {
      SYP: { total: 1_000_000, paid: 0, remaining: 1_000_000, overdue: 1_000_000 },
    });
  });

  it('[FEE-40b] cancelling the same payment twice is refused', async () => {
    await inst.admin.fails('patch', `/payments/${paymentId}/cancel`, 400, { reason: 'مرة ثانية' });
  });

  it('[FEE-42] cancelling the payment that completed a contract re-opens it (ACTIVE)', async () => {
    const full = await inst.admin.post(`/contracts/${contractId}/payments`, { amount: 1_000_000 });
    expect((await s.prisma.studentSubscription.findUniqueOrThrow({ where: { id: contractId } })).status).toBe('COMPLETED');
    await inst.admin.patch(`/payments/${full.id}/cancel`, { reason: 'شيك مرتجع' });
    expect((await s.prisma.studentSubscription.findUniqueOrThrow({ where: { id: contractId } })).status).toBe('ACTIVE');
  });

  it('[FEE-43] cancelled payments are out of every total but still listed as cancelled', async () => {
    const overview = await inst.admin.get('/dashboard/overview');
    const rows: { currency: string; collectedThisMonth: unknown }[] = overview.finance?.currencies ?? overview.finance?.rows ?? overview.finance;
    const syp = rows.find((r) => r.currency === 'SYP');
    expect(num(syp?.collectedThisMonth ?? 0)).toBe(0); // the November payment was cancelled
    const cancelled = await inst.admin.get('/payments?status=CANCELLED');
    expect((cancelled.data ?? cancelled).map((p: { receiptNumber: number }) => p.receiptNumber).sort()).toEqual([1, 2]);
  });
});
