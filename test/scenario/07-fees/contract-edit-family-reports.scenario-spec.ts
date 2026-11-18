/**
 * [T1] 7.6 contract edit, 7.7 family payment, 7.8 overdue job and reports. Plan: 07-fees-finance.md.
 * Golden numbers:
 *   7.6  1,500,000 - 100,000 = 1,400,000 / 8 = 175,000; #1 paid. New discount 200,000 (total 1,300,000) over 7:
 *        1,125,000 left -> 6 x 160,714 + 160,716, numbered 2..8, from the first unpaid due date 2026-10-01
 *   7.8  1,000,000 / 3 (09-01, 10-01, 11-01); 300,000 paid 09-30 23:30 local and 200,000 on 10-01 00:10 local
 *        monthly collection: 2026-09 due 333,333 collected 300,000 ; 2026-10 due 333,333 collected 200,000 ;
 *        2026-11 due 333,334 collected 0 (a payment belongs to its LOCAL month)
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { FeesProcessor } from '../../../src/modules/fees/jobs/fees.processor';
import { startApp, type ScenarioApp } from '../support/app';
import { InstituteFixture, signIn } from '../support/builders';
import { eventually, uniquePhone } from '../support/client';
import { realClock, setClock } from '../support/clock';
import { expectPerCurrency, installmentsInDb, num, type CurrencyRow } from '../support/money';

type Table = { type: 'table'; rows: Record<string, unknown>[] };
const tableOf = (doc: { blocks: { type: string }[] }): Table => doc.blocks.find((b) => b.type === 'table') as Table;
const money = (cell: unknown) => num((cell as { amount: number }).amount);
const rowsOf = (body: unknown): CurrencyRow[] =>
  Array.isArray(body) ? body : ((body as Record<string, CurrencyRow[]>).currencies ?? (body as Record<string, CurrencyRow[]>).totals);

describe('[T1] 7.6-7.8 contract edit, family payment, overdue job, reports', () => {
  let s: ScenarioApp;
  let inst: InstituteFixture;
  let section: number;
  let usdSection: number;
  let seq = 0;

  const newContract = async (body: Record<string, unknown>, sectionId = section, familyId?: number, phone?: string) => {
    seq += 1;
    const st = await inst.student({
      fullName: `طالب ${seq}`, sectionId, ...(familyId ? { familyId } : { newFamily: { familyName: `عائلة ${seq}`, fatherName: `أب ${seq}`, phone } }),
    });
    const c = await inst.admin.post(`/enrollments/${await inst.enrollmentOf(st.id)}/contract`, body);
    return { studentId: st.id, familyId: st.familyId, contractId: c.id as number };
  };

  beforeAll(async () => {
    setClock('2026-09-01 09:00');
    s = await startApp();
    inst = await InstituteFixture.create(s, 'العقود والتقارير');
    const ab = await inst.anyAcademicBranch();
    section = await inst.section({ name: 'التاسع - أ', academicBranchId: ab, fee: 1_500_000 });
    usdSection = await inst.section({ name: 'شعبة الدولار', academicBranchId: ab, fee: 600, currency: 'USD' });
  });

  afterAll(async () => {
    realClock();
    await s?.close();
  });

  describe('7.6 contract edit', () => {
    let c: { contractId: number };

    beforeAll(async () => {
      setClock('2026-09-01 09:00');
      c = await newContract({ discountAmount: 100_000, numberOfInstallments: 8, startDate: '2026-09-01' });
      setClock('2026-09-05 10:00');
      await inst.admin.post(`/contracts/${c.contractId}/payments`, { amount: 175_000 });
    });

    it('[FEE-50] a bigger discount re-spreads only the unpaid balance: 6 x 160,714 + 160,716 from 10-01', async () => {
      await inst.admin.patch(`/contracts/${c.contractId}`, { discountAmount: 200_000, numberOfInstallments: 7 });
      expect((await installmentsInDb(s.prisma, c.contractId)).map((i) => [i.installmentNumber, i.amount, i.paid, i.dueDate])).toEqual([
        [1, 175_000, 175_000, '2026-09-01'],
        [2, 160_714, 0, '2026-10-01'],
        [3, 160_714, 0, '2026-11-01'],
        [4, 160_714, 0, '2026-12-01'],
        [5, 160_714, 0, '2027-01-01'],
        [6, 160_714, 0, '2027-02-01'],
        [7, 160_714, 0, '2027-03-01'],
        [8, 160_716, 0, '2027-04-01'],
      ]);
      const row = await s.prisma.studentSubscription.findUniqueOrThrow({ where: { id: c.contractId } });
      expect(num(row.totalAmount)).toBe(1_300_000);
    });

    it('[FEE-51] saving only the reason never re-spreads (same installment ids and amounts)', async () => {
      const before = await s.prisma.installment.findMany({ where: { subscriptionId: c.contractId }, orderBy: { installmentNumber: 'asc' } });
      await inst.admin.patch(`/contracts/${c.contractId}`, { discountReason: 'حسم الإخوة - تعديل' });
      const after = await s.prisma.installment.findMany({ where: { subscriptionId: c.contractId }, orderBy: { installmentNumber: 'asc' } });
      expect(after.map((i) => [i.id, num(i.amount)])).toEqual(before.map((i) => [i.id, num(i.amount)]));
    });

    it('[FEE-52] a discount that puts the total under what is already paid is refused', async () => {
      await inst.admin.fails('patch', `/contracts/${c.contractId}`, 400, { discountAmount: 1_400_000 });
      const row = await s.prisma.studentSubscription.findUniqueOrThrow({ where: { id: c.contractId } });
      expect(num(row.totalAmount)).toBe(1_300_000);
    });
  });

  describe('7.7 family payment (one visit, several children)', () => {
    let yazan: { studentId: number; familyId: number; contractId: number };
    let salma: { contractId: number };
    let familyPhone: string;

    beforeAll(async () => {
      setClock('2026-09-10 10:00');
      familyPhone = uniquePhone();
      yazan = await newContract({ grossAmount: 1_000_000, numberOfInstallments: 1, startDate: '2026-10-01' }, section, undefined, familyPhone);
      salma = await newContract({ numberOfInstallments: 1, startDate: '2026-10-01' }, usdSection, yazan.familyId);
    });

    it('[FEE-61] one line over the remaining refuses the whole visit: nothing saved, no receipt used', async () => {
      const before = await s.prisma.payment.count({ where: { instituteId: inst.id } });
      await inst.admin.fails('post', `/families/${yazan.familyId}/payments`, 400, {
        payments: [{ contractId: yazan.contractId, amount: 300_000 }, { contractId: salma.contractId, amount: 601, currency: 'USD' }],
      });
      expect(await s.prisma.payment.count({ where: { instituteId: inst.id } })).toBe(before);
    });

    it('[FEE-60] two children, two currencies: two payments, consecutive receipts, shared method and note', async () => {
      const last = await s.prisma.payment.aggregate({ where: { instituteId: inst.id }, _max: { receiptNumber: true } });
      const next = (last._max.receiptNumber ?? 0) + 1;
      const paid = await inst.admin.post(`/families/${yazan.familyId}/payments`, {
        payments: [{ contractId: yazan.contractId, amount: 300_000 }, { contractId: salma.contractId, amount: 50, currency: 'USD' }],
        paymentMethod: 'BANK_TRANSFER',
        note: 'دفعة أيلول للأخوين',
      });
      expect(paid.map((p: { receiptNumber: number; paymentMethod: string; note: string }) => [p.receiptNumber, p.paymentMethod, p.note])).toEqual([
        [next, 'BANK_TRANSFER', 'دفعة أيلول للأخوين'],
        [next + 1, 'BANK_TRANSFER', 'دفعة أيلول للأخوين'],
      ]);
      expectPerCurrency(rowsOf((await inst.admin.get(`/families/${yazan.familyId}/financial-summary`)).totals ?? []), {
        SYP: { total: 1_000_000, paid: 300_000, remaining: 700_000, overdue: 0 },
        USD: { total: 600, paid: 50, remaining: 550, overdue: 0 },
      });
    });

    it('[FEE-64] the family is told about EACH payment (two PAYMENT_RECEIVED notices)', async () => {
      const family = await signIn(s, familyPhone);
      const inbox = await eventually(() => family.get('/notifications?page=1&limit=20'), (b) => b.total >= 2);
      expect(inbox.data.filter((n: { type: string }) => n.type === 'PAYMENT_RECEIVED')).toHaveLength(2);
    });

    it('[FEE-62/63] a contract of another family, a repeated contract or 11 lines are refused', async () => {
      const stranger = await newContract({ grossAmount: 100_000, numberOfInstallments: 1, startDate: '2026-10-01' });
      await inst.admin.fails('post', `/families/${yazan.familyId}/payments`, 400, { payments: [{ contractId: stranger.contractId, amount: 1_000 }] });
      await inst.admin.fails('post', `/families/${yazan.familyId}/payments`, 400, {
        payments: [{ contractId: yazan.contractId, amount: 1_000 }, { contractId: yazan.contractId, amount: 1_000 }],
      });
      await inst.admin.fails('post', `/families/${yazan.familyId}/payments`, 400, {
        payments: Array.from({ length: 11 }, () => ({ contractId: yazan.contractId, amount: 1 })),
      });
    });
  });

  describe('7.8 overdue job and reports', () => {
    let c: { studentId: number; contractId: number };
    let dueToday: { contractId: number };

    beforeAll(async () => {
      setClock('2026-09-01 09:00');
      c = await newContract({ grossAmount: 1_000_000, numberOfInstallments: 3, startDate: '2026-09-01' });
      dueToday = await newContract({ grossAmount: 100_000, numberOfInstallments: 1, startDate: '2026-11-18' });
      setClock('2026-09-30 23:30'); // still September in Damascus (20:30 UTC)
      await inst.admin.post(`/contracts/${c.contractId}/payments`, { amount: 300_000 });
      setClock('2026-10-01 00:10'); // October in Damascus, still September 30 in UTC
      await inst.admin.post(`/contracts/${c.contractId}/payments`, { amount: 200_000 });
      setClock('2026-11-18 10:00');
    });

    it('[FEE-70] the hourly job stores OVERDUE for past-due open installments, never for one due today; twice = same', async () => {
      await s.runJob(FeesProcessor, 'mark-overdue-installments', inst.id);
      await s.runJob(FeesProcessor, 'mark-overdue-installments', inst.id);
      expect((await installmentsInDb(s.prisma, c.contractId)).map((i) => [i.paid, i.status])).toEqual([
        [333_333, 'PAID'],
        [166_667, 'OVERDUE'],
        [0, 'OVERDUE'],
      ]);
      expect((await installmentsInDb(s.prisma, dueToday.contractId))[0].status).toBe('PENDING');
    });

    it('[FEE-72] monthly collection puts each payment in its LOCAL month', async () => {
      const doc = await inst.admin.get('/reports/monthly-collection');
      const rows = tableOf(doc).rows
        .filter((r) => ['2026-09', '2026-10', '2026-11'].includes(String(r.month)))
        .map((r) => [r.month, money(r.due), money(r.collected)]);
      // due = every contract of the file falling in that month (golden contract + the others of this file)
      const sept = rows.find((r) => r[0] === '2026-09')!;
      const oct = rows.find((r) => r[0] === '2026-10')!;
      // September SYP in this institute: 175,000 (7.6, 09-05) + 300,000 (family visit 7.7, 09-10)
      // + 300,000 (09-30 23:30 local, which is still September in Damascus)
      expect(sept[2]).toBe(775_000);
      expect(oct[2]).toBe(200_000);
    });

    it('[FEE-73] students without a contract lists exactly the active students with none', async () => {
      const lonely = await inst.student({ fullName: 'طالب بلا عقد', sectionId: section, newFamily: { familyName: 'بلا عقد' } });
      const doc = await inst.admin.get('/reports/students-without-contract');
      const names = tableOf(doc).rows.map((r) => r.student);
      expect(names).toEqual(['طالب بلا عقد']);
      expect(lonely.id).toBeGreaterThan(0);
    });

    it('[FEE-75] one student, the same numbers in the dashboard API and the parents app', async () => {
      const phone = uniquePhone();
      const fam = await newContract({ grossAmount: 900_000, numberOfInstallments: 3, startDate: '2026-09-01' }, section, undefined, phone);
      await inst.admin.post(`/contracts/${fam.contractId}/payments`, { amount: 400_000 });
      const expected = { SYP: { total: 900_000, paid: 400_000, remaining: 500_000, overdue: 500_000 } };
      expectPerCurrency(rowsOf(await inst.admin.get(`/students/${fam.studentId}/financial-summary`)), expected);
      const family = await signIn(s, phone);
      const mobile = await family.get(`/mobile/students/${fam.studentId}/finance`);
      expectPerCurrency(rowsOf(mobile.totals ?? mobile), expected);
    });
  });
});
