/**
 * [T2] 1.2 sign-in and sessions, 1.3 accounts. Plan: 01-tenancy-auth-roles.md
 * Access tokens live 15 minutes, refresh tokens 7 days; default password 12345678
 * forces a change at first sign-in.
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { startApp, type ScenarioApp } from '../support/app';
import { CHANGED_PASSWORD, InstituteFixture, signIn } from '../support/builders';
import { Api, uniquePhone } from '../support/client';
import { realClock, setClock } from '../support/clock';

interface Tokens { accessToken: string; refreshToken: string; user: { id: number; mustChangePassword: boolean } }

describe('[T2] 1.2-1.3 sign-in, sessions and accounts', () => {
  let s: ScenarioApp;
  let inst: InstituteFixture;
  let anon: Api;

  beforeAll(async () => {
    setClock('2026-11-18 09:00');
    s = await startApp();
    inst = await InstituteFixture.create(s, 'الدخول');
    anon = new Api(s.app);
  });

  afterAll(async () => {
    realClock();
    await s?.close();
  });

  const login = (phone: string, password: string, status?: number) =>
    anon.call<Tokens>('post', '/auth/login', { phone, password }, status ? { status } : {});

  it('[ACC-01..03] a new teacher must change the default password before anything else', async () => {
    const phone = uniquePhone();
    await inst.admin.post('/teachers', { fullName: 'أ. هبة النوري', phone, branchIds: [inst.branchId] });
    const first = await login(phone, '12345678');
    expect(first.user.mustChangePassword).toBe(true);
    const raw = new Api(s.app, first.accessToken);
    const blocked = await raw.fails('get', '/teacher/overview', 403);
    expect(JSON.stringify(blocked)).toMatch(/password/i);
    await raw.get('/auth/me');
    await raw.fails('post', '/auth/change-password', 400, { currentPassword: '12345678', newPassword: '12345678' });
    const changed = await raw.post<Tokens>('/auth/change-password', { currentPassword: '12345678', newPassword: CHANGED_PASSWORD });
    await new Api(s.app, changed.accessToken).get('/teacher/overview');
    // every refresh token of the old session is revoked
    await anon.fails('post', '/auth/refresh', 401, { refreshToken: first.refreshToken });
  });

  it('[AUTH-06] refresh rotates the pair; the old refresh token is dead; after 7 days the session ends', async () => {
    const t = await login(inst.adminPhone, CHANGED_PASSWORD);
    const next = await anon.post<Tokens>('/auth/refresh', { refreshToken: t.refreshToken });
    expect(next.refreshToken).not.toBe(t.refreshToken);
    await anon.fails('post', '/auth/refresh', 401, { refreshToken: t.refreshToken });
    setClock('2026-11-25 09:01'); // 7 days and a minute later
    await anon.fails('post', '/auth/refresh', 401, { refreshToken: next.refreshToken });
    setClock('2026-11-18 09:00');
  });

  it('[AUTH-08] an access token is refused after 15 minutes', async () => {
    const t = await login(inst.adminPhone, CHANGED_PASSWORD);
    const raw = new Api(s.app, t.accessToken); // no automatic re-login
    setClock('2026-11-18 09:14');
    await raw.get('/students');
    setClock('2026-11-18 09:16');
    await raw.fails('get', '/students', 401);
    setClock('2026-11-18 09:00');
  });

  it('[AUTH-07] logout deletes every refresh token of the user (all devices)', async () => {
    const one = await login(inst.adminPhone, CHANGED_PASSWORD);
    await login(inst.adminPhone, CHANGED_PASSWORD);
    const adminId = one.user.id;
    expect(await s.prisma.refreshToken.count({ where: { userId: adminId } })).toBeGreaterThanOrEqual(2);
    await new Api(s.app, one.accessToken).post('/auth/logout');
    expect(await s.prisma.refreshToken.count({ where: { userId: adminId } })).toBe(0);
  });

  it('[AUTH-02] the same phone in two institutes needs the institute code', async () => {
    const other = await InstituteFixture.create(s, 'دخول ثان');
    const phone = uniquePhone();
    await inst.student({ fullName: 'طالب أ', newFamily: { familyName: 'أ', fatherName: 'أب', phone } });
    await other.student({ fullName: 'طالب ب', newFamily: { familyName: 'ب', fatherName: 'أب', phone } });
    const err = await anon.fails('post', '/auth/login', 400, { phone, password: '12345678' });
    expect(JSON.stringify(err)).toMatch(/institute/i);
    const code = (await s.prisma.institute.findUniqueOrThrow({ where: { id: other.id } })).code;
    const ok = await anon.post<Tokens>('/auth/login', { phone, password: '12345678', instituteCode: code });
    const user = await s.prisma.user.findUniqueOrThrow({ where: { id: ok.user.id } });
    expect(user.instituteId).toBe(other.id);
  });

  it('[ACC-04] the guardian account is named after the father, else the mother, else the family', async () => {
    const cases = [
      [{ familyName: 'الحسن', fatherName: 'أحمد الحسن', motherName: 'هالة' }, 'أحمد الحسن', 'FATHER'],
      [{ familyName: 'السيد', motherName: 'هالة السيد' }, 'هالة السيد', 'MOTHER'],
      [{ familyName: 'النجار' }, 'عائلة النجار', 'GUARDIAN'],
    ] as const;
    for (const [family, name, relationship] of cases) {
      const phone = uniquePhone();
      const st = await inst.student({ fullName: 'طالب', newFamily: { ...family, phone } });
      const user = await s.prisma.user.findFirstOrThrow({ where: { instituteId: inst.id, phone } });
      const link = await s.prisma.familyUser.findFirstOrThrow({ where: { userId: user.id, familyId: st.familyId } });
      expect([user.role, user.fullName, link.relationship]).toEqual(['FAMILY', name, relationship]);
    }
  });

  it('[ACC-05] one guardian phone on two families sees the children of both', async () => {
    const phone = uniquePhone();
    await inst.student({ fullName: 'ولد أول', newFamily: { familyName: 'الأولى', fatherName: 'أب', phone } });
    await inst.student({ fullName: 'ولد ثان', newFamily: { familyName: 'الثانية', fatherName: 'أب', phone } });
    const guardian = await signIn(s, phone);
    const me = await guardian.get('/mobile/me');
    expect(me.children.map((c: { fullName: string }) => c.fullName).sort()).toEqual(['ولد أول', 'ولد ثان']);
  });

  it('[ACC-06] a family phone that belongs to a teacher never takes over the teacher account', async () => {
    const phone = uniquePhone();
    await inst.admin.post('/teachers', { fullName: 'أ. محمود', phone, branchIds: [inst.branchId] });
    const res = await inst.admin.post('/families', { familyName: 'المحمود', fatherName: 'أب', phone });
    expect(res.accountStatus).toBe('PHONE_TAKEN');
    const user = await s.prisma.user.findFirstOrThrow({ where: { instituteId: inst.id, phone } });
    expect(user.role).toBe('TEACHER');
  });

  it('[ACC-09/10] reset and deactivate: not on yourself; a deactivated teacher is out everywhere', async () => {
    const admin = await s.prisma.user.findFirstOrThrow({ where: { instituteId: inst.id, role: 'INSTITUTE_ADMIN' } });
    await inst.admin.fails('post', `/accounts/${admin.id}/reset-password`, 400);
    await inst.admin.fails('patch', `/accounts/${admin.id}/active`, 400, { isActive: false });

    const phone = uniquePhone();
    const t = await inst.admin.post('/teachers', { fullName: 'أ. لينا', phone, branchIds: [inst.branchId] });
    const teacher = await signIn(s, phone);
    const user = await s.prisma.user.findFirstOrThrow({ where: { instituteId: inst.id, phone } });
    await inst.admin.patch(`/accounts/${user.id}/active`, { isActive: false });
    const row = await s.prisma.teacher.findUniqueOrThrow({ where: { id: t.id ?? t.teacher?.id } });
    expect(row.isActive).toBe(false);
    expect(await s.prisma.refreshToken.count({ where: { userId: user.id } })).toBe(0);
    const err = await anon.fails('post', '/auth/login', 401, { phone, password: CHANGED_PASSWORD });
    expect(JSON.stringify(err)).toMatch(/deactivat/i);
    expect(teacher).toBeDefined();
  });

  it('[ACC-11] a deactivated guardian is refused on the very next parents-app request', async () => {
    const phone = uniquePhone();
    const st = await inst.student({ fullName: 'سلمى', gender: 'FEMALE', newFamily: { familyName: 'المعطلة', fatherName: 'أب', phone } });
    const guardian = await signIn(s, phone);
    await guardian.get('/mobile/me');
    const user = await s.prisma.user.findFirstOrThrow({ where: { instituteId: inst.id, phone } });
    await inst.admin.patch(`/accounts/${user.id}/active`, { isActive: false });
    await guardian.fails('get', `/mobile/students/${st.id}/overview`, 401);
  });

  it('[ACC-12] a phone is unique across account types', async () => {
    const phone = uniquePhone();
    await inst.admin.post('/teachers', { fullName: 'أ. سامر', phone, branchIds: [inst.branchId] });
    await inst.admin.fails('post', '/staff', 409, { fullName: 'موظف', phone, role: 'REGISTRAR' });
  });

  it('[ACC-08] syncing family accounts twice: the second run creates nothing', async () => {
    // A family whose phone was added later (no guardian yet) gets one on the first sync only
    const phone = uniquePhone();
    const fam = await s.prisma.family.create({ data: { instituteId: inst.id, familyName: 'بلا حساب', fatherName: 'أب متأخر', phone } });
    const links = () => s.prisma.familyUser.count({ where: { family: { instituteId: inst.id } } });
    const before = await links();
    await inst.admin.post('/accounts/families/sync');
    const afterFirst = await links();
    await inst.admin.post('/accounts/families/sync');
    expect([afterFirst - before, (await links()) - afterFirst]).toEqual([1, 0]);
    expect(await s.prisma.familyUser.count({ where: { familyId: fam.id } })).toBe(1);
  });
});
