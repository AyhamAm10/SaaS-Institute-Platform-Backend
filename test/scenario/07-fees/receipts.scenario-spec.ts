/**
 * [T1] 7.4 Receipt numbers. Plan: 07-fees-finance.md.
 * One counter per (institute, branch, academic year); numbers never reused,
 * consecutive under concurrency, a failed payment does not burn a number.
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { startApp, type ScenarioApp } from '../support/app';
import { InstituteFixture } from '../support/builders';
import { realClock, setClock } from '../support/clock';

describe('[T1] 7.4 receipt numbers', () => {
  let s: ScenarioApp;
  let inst: InstituteFixture;
  let mazzehSection: number;
  let malkiSection: number;
  let malkiBranch: number;
  let seq = 0;
  const receipts: Record<string, { id: number; receiptNumber: number }> = {};

  /** A student with a 1,000,000 contract in one installment; returns the contract id. */
  const contract = async (sectionId: number, branchId?: number) => {
    seq += 1;
    const st = await inst.student({ fullName: `طالب ${seq}`, sectionId, branchId, newFamily: { familyName: `عائلة ${seq}` } });
    return (await inst.admin.post(`/enrollments/${await inst.enrollmentOf(st.id)}/contract`, { numberOfInstallments: 1, startDate: '2026-10-01' })).id as number;
  };

  beforeAll(async () => {
    setClock('2026-09-10 10:00');
    s = await startApp();
    inst = await InstituteFixture.create(s, 'الإيصالات');
    const ab = await inst.anyAcademicBranch();
    mazzehSection = await inst.section({ name: 'التاسع - أ', academicBranchId: ab, fee: 1_000_000 });
    malkiBranch = await inst.branch('المالكي');
    malkiSection = await inst.section({ name: 'التاسع - المالكي', academicBranchId: ab, fee: 1_000_000, branchId: malkiBranch });
  });

  afterAll(async () => {
    realClock();
    await s?.close();
  });

  it('[FEE-30] three payments in the first branch get receipts 1, 2, 3', async () => {
    for (const key of ['a', 'b', 'c']) {
      const p = await inst.admin.post(`/contracts/${await contract(mazzehSection)}/payments`, { amount: 100_000 });
      receipts[key] = p;
    }
    expect([receipts.a, receipts.b, receipts.c].map((p) => p.receiptNumber)).toEqual([1, 2, 3]);
  });

  it('[FEE-31] the second branch has its own counter (starts at 1); lookup by number returns both', async () => {
    const p = await inst.admin.post(`/contracts/${await contract(malkiSection, malkiBranch)}/payments`, { amount: 100_000 });
    expect(p.receiptNumber).toBe(1);
    const found = await inst.admin.get('/payments/by-receipt/1');
    expect((Array.isArray(found) ? found : found.data).map((x: { id: number }) => x.id).sort()).toEqual([receipts.a.id, p.id].sort());
  });

  it('[FEE-32] a cancelled receipt keeps its number; the next payment gets 4, never 2', async () => {
    await inst.admin.patch(`/payments/${receipts.b.id}/cancel`, { reason: 'إيصال مكرر' });
    const p = await inst.admin.post(`/contracts/${await contract(mazzehSection)}/payments`, { amount: 100_000 });
    expect(p.receiptNumber).toBe(4);
    const cancelled = await inst.admin.get(`/payments/${receipts.b.id}`);
    expect([cancelled.receiptNumber, cancelled.status]).toEqual([2, 'CANCELLED']);
  });

  it('[FEE-33] 10 simultaneous payments get 10 distinct consecutive numbers (5..14)', async () => {
    const contracts: number[] = [];
    for (let i = 0; i < 10; i++) contracts.push(await contract(mazzehSection));
    const paid = await Promise.all(contracts.map((id) => inst.admin.post(`/contracts/${id}/payments`, { amount: 50_000 })));
    expect(paid.map((p) => p.receiptNumber).sort((x: number, y: number) => x - y)).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  });

  it('[FEE-34] a refused payment does not burn a number: the next one is 15', async () => {
    const id = await contract(mazzehSection);
    await inst.admin.fails('post', `/contracts/${id}/payments`, 400, { amount: 1_000_001 });
    const p = await inst.admin.post(`/contracts/${id}/payments`, { amount: 1 });
    expect(p.receiptNumber).toBe(15);
  });
});
