/**
 * [T1] 7.3 Two currencies. Plan: 07-fees-finance.md. Rate = SYP per 1 USD.
 * Family الخطيب: يزن on a SYP contract of 2,000,000 (1 installment due 10-01),
 *                سلمى on a USD contract of 600.00 (7 installments from 10-01).
 * Golden numbers (payments on 2026-09-10):
 *   100 USD on the SYP contract at 13,000        -> applied 1,300,000 SYP
 *   1,000,000 SYP on the USD contract at 13,000   -> 76.923.. -> applied 76.92 USD
 *   family summary: SYP 2,000,000 / 1,300,000 / 700,000 ; USD 600.00 / 76.92 / 523.08 ; no overdue yet
 *   dashboard "collected this month" counts each payment in ITS OWN currency:
 *     USD 100 (the dollars handed over) and SYP 1,000,000 (the pounds handed over)
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { startApp, type ScenarioApp } from '../support/app';
import { InstituteFixture } from '../support/builders';
import { realClock, setClock } from '../support/clock';
import { expectPerCurrency, installmentsInDb, num, type CurrencyRow } from '../support/money';

describe('[T1] 7.3 two currencies', () => {
  let s: ScenarioApp;
  let inst: InstituteFixture;
  let familyId: number;
  let sypContract: number;
  let usdContract: number;
  let sypSection: number;
  let usdSection: number;

  const rowsOf = (body: unknown): CurrencyRow[] =>
    Array.isArray(body) ? body : ((body as { currencies?: CurrencyRow[]; totals?: CurrencyRow[] }).currencies ?? (body as { totals: CurrencyRow[] }).totals);

  beforeAll(async () => {
    setClock('2026-09-10 10:00');
    s = await startApp();
    inst = await InstituteFixture.create(s, 'العملتين');
    const ab = await inst.anyAcademicBranch();
    sypSection = await inst.section({ name: 'شعبة الليرة', academicBranchId: ab, fee: 2_000_000 });
    usdSection = await inst.section({ name: 'شعبة الدولار', academicBranchId: ab, fee: 600, currency: 'USD' });
    const yazan = await inst.student({ fullName: 'يزن الخطيب', sectionId: sypSection, newFamily: { familyName: 'الخطيب' } });
    familyId = yazan.familyId;
    const salma = await inst.student({ fullName: 'سلمى الخطيب', gender: 'FEMALE', sectionId: usdSection, familyId });
    sypContract = (await inst.admin.post(`/enrollments/${await inst.enrollmentOf(yazan.id)}/contract`, { numberOfInstallments: 1, startDate: '2026-10-01' })).id;
    usdContract = (await inst.admin.post(`/enrollments/${await inst.enrollmentOf(salma.id)}/contract`, { numberOfInstallments: 7, startDate: '2026-10-01' })).id;
  });

  afterAll(async () => {
    realClock();
    await s?.close();
  });

  it('[FEE-20] 100 USD on a SYP contract at 13,000 applies 1,300,000 SYP; the payment keeps its 100 USD', async () => {
    const p = await inst.admin.post(`/contracts/${sypContract}/payments`, { amount: 100, currency: 'USD', exchangeRate: 13_000 });
    expect([num(p.amount), p.currency, num(p.appliedAmount)]).toEqual([100, 'USD', 1_300_000]);
    expect((await installmentsInDb(s.prisma, sypContract))[0].paid).toBe(1_300_000);
  });

  it('[FEE-21] 1,000,000 SYP on a USD contract at 13,000 applies 76.92 USD (rounded to the cent)', async () => {
    const p = await inst.admin.post(`/contracts/${usdContract}/payments`, { amount: 1_000_000, currency: 'SYP', exchangeRate: 13_000 });
    expect([num(p.amount), p.currency, num(p.appliedAmount)]).toEqual([1_000_000, 'SYP', 76.92]);
    const paid = (await installmentsInDb(s.prisma, usdContract)).map((i) => i.paid);
    expect(paid).toEqual([76.92, 0, 0, 0, 0, 0, 0]);
  });

  it('[FEE-22] another currency without a rate (or a zero rate) is refused and writes nothing', async () => {
    const before = await s.prisma.payment.count({ where: { subscriptionId: sypContract } });
    await inst.admin.fails('post', `/contracts/${sypContract}/payments`, 400, { amount: 10, currency: 'USD' });
    await inst.admin.fails('post', `/contracts/${sypContract}/payments`, 400, { amount: 10, currency: 'USD', exchangeRate: 0 });
    expect(await s.prisma.payment.count({ where: { subscriptionId: sypContract } })).toBe(before);
  });

  it('[FEE-23] precision: a rate with 5 decimals or pounds with fractions are refused', async () => {
    await inst.admin.fails('post', `/contracts/${sypContract}/payments`, 400, { amount: 10, currency: 'USD', exchangeRate: 13_000.12345 });
    await inst.admin.fails('post', `/contracts/${sypContract}/payments`, 400, { amount: 100.5 });
  });

  it('[FEE-24] the remaining is checked on the CONVERTED amount: 1,000,000 SYP at 12,000 = 83.33 USD > 50 USD left', async () => {
    const st = await inst.student({ fullName: 'كريم الدباغ', sectionId: usdSection, newFamily: { familyName: 'الدباغ' } });
    const c = await inst.admin.post(`/enrollments/${await inst.enrollmentOf(st.id)}/contract`, { grossAmount: 50, numberOfInstallments: 1, startDate: '2026-10-01' });
    const err = await inst.admin.fails('post', `/contracts/${c.id}/payments`, 400, { amount: 1_000_000, currency: 'SYP', exchangeRate: 12_000 });
    expect(JSON.stringify(err)).toMatch(/remaining|exceeds/i);
    // 600,000 SYP at 12,000 = exactly 50.00 USD: accepted
    const ok = await inst.admin.post(`/contracts/${c.id}/payments`, { amount: 600_000, currency: 'SYP', exchangeRate: 12_000 });
    expect(num(ok.appliedAmount)).toBe(50);
  });

  it('[FEE-25] the family summary keeps SYP and USD on separate rows, never summed', async () => {
    const body = await inst.admin.get(`/families/${familyId}/financial-summary`);
    expectPerCurrency(rowsOf(body.totals ?? body), {
      SYP: { total: 2_000_000, paid: 1_300_000, remaining: 700_000, overdue: 0 },
      USD: { total: 600, paid: 76.92, remaining: 523.08, overdue: 0 },
    });
  });

  it('[FEE-26] dashboard "collected this month" counts each payment in its own currency', async () => {
    const overview = await inst.admin.get('/dashboard/overview');
    const rows: { currency: string; collectedThisMonth: unknown }[] = overview.finance?.currencies ?? overview.finance?.rows ?? overview.finance;
    const collected = Object.fromEntries(rows.map((r) => [r.currency, num(r.collectedThisMonth)]));
    // 100 USD (FEE-20) ; SYP: 1,000,000 (FEE-21) + 600,000 (FEE-24)
    expect(collected).toEqual({ USD: 100, SYP: 1_600_000 });
  });
});
