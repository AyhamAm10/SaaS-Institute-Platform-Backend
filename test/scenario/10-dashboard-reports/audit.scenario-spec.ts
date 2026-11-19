/**
 * [T7] 10.3 the audit log. Plan: 10-dashboard-reports.md
 * Only updates and deletes of audited repositories are logged (creations are not), with the user,
 * the time and, for updates, the changed fields before / after. Passwords are never stored.
 * 2026-11-17 23:30 (Damascus): the admin renames a student. 2026-11-18 10:00: the accountant
 * cancels a payment. 2026-11-18 11:00: the admin resets the accountant's password.
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { startApp, type ScenarioApp } from '../support/app';
import { InstituteFixture, signIn } from '../support/builders';
import { type Api, uniquePhone } from '../support/client';
import { realClock, setClock } from '../support/clock';

type Row = { id: number; entity: string; entityId: number; action: string; userId?: number; user?: { id: number; fullName: string } | null; userName?: string; createdAt: string; changes?: { field: string; before: unknown; after: unknown }[] };

describe('[T7] 10.3 audit log', () => {
  let s: ScenarioApp;
  let inst: InstituteFixture;
  let accountant: Api;
  let accountantId: number;
  let accountantPhone: string;
  let studentId: number;
  let paymentId: number;

  const search = async (q: Record<string, string | number> = {}): Promise<Row[]> => {
    const res = await inst.admin.get(`/audit-log?${new URLSearchParams(Object.entries({ limit: 100, ...q }).map(([k, v]) => [k, String(v)]))}`);
    return res.data ?? res.items ?? res;
  };
  const who = (r: Row) => r.user?.fullName ?? r.userName;

  beforeAll(async () => {
    setClock('2026-11-17 09:00');
    s = await startApp();
    inst = await InstituteFixture.create(s, 'التدقيق');
    const section = await inst.section({ name: 'A', academicBranchId: await inst.anyAcademicBranch(), fee: 1_000_000 });
    studentId = (await inst.student({ fullName: 'يزن الخطيب', sectionId: section, newFamily: { familyName: 'الخطيب' } })).id;
    const contract = await inst.admin.post(`/enrollments/${await inst.enrollmentOf(studentId)}/contract`, { numberOfInstallments: 2 });
    const phone = uniquePhone();
    const staff = await inst.admin.post('/staff', { fullName: 'سامي المحاسب', phone, role: 'ACCOUNTANT' });
    accountantId = staff.id;
    accountant = await signIn(s, phone);
    accountantPhone = phone;
    paymentId = (await accountant.post(`/contracts/${contract.id}/payments`, { amount: 300_000 })).id;

    setClock('2026-11-17 23:30');
    await inst.admin.patch(`/students/${studentId}`, { fullName: 'يزن محمد الخطيب' });
    setClock('2026-11-18 10:00');
    await accountant.patch(`/payments/${paymentId}/cancel`, { reason: 'مبلغ خطأ' });
    setClock('2026-11-18 11:00');
    await inst.admin.post(`/accounts/${accountantId}/reset-password`, {});
  });

  afterAll(async () => {
    realClock();
    await s?.close();
  });

  it('[AUD-01] cancelling a payment is one UPDATE row: the accountant, the time, status ACTIVE -> CANCELLED', async () => {
    const rows = (await search({ entityId: paymentId })).filter((r) => /payment/i.test(r.entity));
    const cancel = rows.find((r) => (r.changes ?? []).some((c) => /status/i.test(c.field)))!;
    expect(cancel).toBeDefined();
    expect([cancel.action, who(cancel)]).toEqual(['UPDATE', 'سامي المحاسب']);
    expect(cancel.changes!.find((c) => /status/i.test(c.field))).toMatchObject({ before: 'ACTIVE', after: 'CANCELLED' });
    expect(new Date(cancel.createdAt).toISOString()).toBe('2026-11-18T07:00:00.000Z');
  });

  it('[AUD-02] filters: by user, by record type, by local period (both ends included)', async () => {
    const byAccountant = await search({ userId: accountantId });
    expect(byAccountant.length).toBeGreaterThan(0);
    expect(byAccountant.every((r) => who(r) === 'سامي المحاسب')).toBe(true);

    const rename = (await search({ entityId: studentId })).find((r) => /student/i.test(r.entity) && (r.changes ?? []).some((c) => /fullName/i.test(c.field)))!;
    expect(rename.changes!.find((c) => /fullName/i.test(c.field))).toMatchObject({ before: 'يزن الخطيب', after: 'يزن محمد الخطيب' });
    expect(rename.entity).toBeTruthy();
    const sameType = await search({ entity: rename.entity });
    expect(sameType.every((r) => r.entity === rename.entity)).toBe(true);

    // 23:30 on the 17th local is the 17th, although it is 20:30 UTC
    const on17 = await search({ from: '2026-11-17', to: '2026-11-17' });
    const on18 = await search({ from: '2026-11-18', to: '2026-11-18' });
    expect(on17.map((r) => r.id)).toContain(rename.id);
    expect(on18.map((r) => r.id)).not.toContain(rename.id);
  });

  it('[AUD-03] a password is never written to the audit log', async () => {
    const rows: { before: unknown; after: unknown; changes: unknown }[] = await s.prisma.$queryRawUnsafe(
      'select * from audit_logs where institute_id = $1', inst.id,
    );
    const text = JSON.stringify(rows);
    expect(text).not.toMatch(/\$2[aby]\$\d{2}\$/); // bcrypt hash
    expect(text).not.toMatch(/"passwordHash":"[^"]/);
  });

  it('[AUD-04] a role without staff.view cannot read the log (403)', async () => {
    const fresh = await signIn(s, accountantPhone); // the reset sent him back to the default password
    await fresh.fails('get', '/audit-log', 403);
  });
});
