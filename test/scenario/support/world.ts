import type { InstituteFixture } from './builders';
import { uniquePhone } from './client';

/**
 * One record of every kind in an institute, every name carrying `marker`, so a
 * leak of this institute's data into another's response can be detected by text.
 * Ids are keyed by the API resource name (path segment) or route parameter name.
 */
export interface World {
  marker: string;
  ids: Record<string, number>;
  familyPhone: string;
  receiptNumber: number;
}

export async function buildWorld(inst: InstituteFixture, marker: string): Promise<World> {
  const a = inst.admin;
  const ids: Record<string, number> = {};
  const name = (what: string) => `${what} ${marker}`;

  ids['branches'] = inst.branchId;
  ids['academic-years'] = inst.yearId;
  ids['academic-branches'] = await inst.academicBranch(name('فرع أكاديمي'));
  ids['subjects'] = await inst.subject(name('مادة'));
  ids['cities'] = (await a.post('/cities', { name: name('مدينة') })).id;
  ids['schools'] = (await a.post('/schools', { name: name('مدرسة'), cityId: ids['cities'] })).id;
  ids['know-ways'] = (await a.post('/know-ways', { name: name('طريقة') })).id;
  ids['exam-types'] = (await a.post('/exam-types', { name: name('نوع') })).id;
  ids['student-statuses'] = (await a.post('/student-statuses', { name: name('حالة') })).id;
  ids['buses'] = (await a.post('/buses', { name: name('باص'), driverName: name('سائق'), driverPhone: '0944555666', plateNumber: '123456' })).id;
  ids['rooms'] = (await a.post('/rooms', { name: name('قاعة'), capacity: 30, branchId: inst.branchId })).id;
  ids['student-fields'] = (await a.post('/student-fields', { label: name('حقل'), type: 'TEXT' })).id;

  const teacher = await a.post('/teachers', {
    fullName: name('أستاذ'),
    phone: uniquePhone(),
    branchIds: [inst.branchId],
    qualifications: [{ academicBranchId: ids['academic-branches'], subjectId: ids['subjects'] }],
  });
  ids['teachers'] = teacher.id ?? teacher.teacher?.id;
  const assignment = await inst.s.prisma.teacherAssignment.findFirstOrThrow({ where: { teacherId: ids['teachers'] } });
  ids['assignmentId'] = assignment.id;

  ids['sections'] = await inst.section({ name: name('شعبة'), academicBranchId: ids['academic-branches'], fee: 1_000_000 });
  await a.post(`/sections/${ids['sections']}/subjects`, { subjectId: ids['subjects'], weeklyPeriods: 2, teacherId: ids['teachers'] });

  const familyPhone = uniquePhone();
  const student = await inst.student({
    fullName: name('طالب'),
    sectionId: ids['sections'],
    newFamily: { familyName: name('عائلة'), fatherName: name('أب'), phone: familyPhone },
  });
  ids['students'] = student.id;
  ids['families'] = student.familyId;
  ids['enrollments'] = await inst.enrollmentOf(student.id);

  const contract = await a.post(`/enrollments/${ids['enrollments']}/contract`, { numberOfInstallments: 2 });
  ids['contracts'] = contract.id;
  const payment = await a.post(`/contracts/${contract.id}/payments`, { amount: 100_000, note: name('دفعة') });
  ids['payments'] = payment.id;

  ids['exams'] = (await a.post('/exams', {
    sectionId: ids['sections'], subjectId: ids['subjects'], title: name('مذاكرة'),
    examDate: new Date().toISOString().slice(0, 10), maxMark: 20, passMark: 10,
  })).id;
  ids['student-notes'] = (await a.post(`/students/${student.id}/notes`, { body: name('ملاحظة') })).id;
  ids['attendance'] = (await a.post('/attendance/check-in', { studentId: student.id })).id;
  ids['closures'] = (await a.post('/closures', { scope: 'INSTITUTE', fromDate: '2027-01-01', toDate: '2027-01-01', reason: name('عطلة') })).id;

  const timetable = await a.get(`/academic-years/${inst.yearId}/sections/${ids['sections']}/timetable`);
  ids['timetables'] = timetable.id ?? timetable.timetable?.id;
  await a.post(`/academic-years/${inst.yearId}/sections/${ids['sections']}/timetable/entries`, {
    subjectId: ids['subjects'], teacherId: ids['teachers'], dayOfWeek: 0, startTime: '08:00', endTime: '08:45',
  });
  ids['entryId'] = (await inst.s.prisma.timetableEntry.findFirstOrThrow({ where: { timetableId: ids['timetables'] } })).id;

  const staff = await a.post('/staff', { fullName: name('موظف'), phone: uniquePhone(), role: 'REGISTRAR' });
  ids['staff'] = staff.id;
  ids['accounts'] = staff.id;
  const notification = await inst.s.prisma.notification.findFirst({ where: { instituteId: inst.id } });
  if (notification) ids['notifications'] = notification.id;
  ids['institutes'] = inst.id;

  // Route parameter names used inside paths
  ids['studentId'] = ids['students'];
  ids['sectionId'] = ids['sections'];
  ids['academicYearId'] = ids['academic-years'];
  ids['subjectId'] = ids['subjects'];
  ids['paymentId'] = ids['payments'];
  ids['instituteId'] = inst.id;

  return { marker, ids, familyPhone, receiptNumber: payment.receiptNumber };
}

/** A fingerprint of EVERY row the institute owns (every table with institute_id). */
export async function tenantFingerprint(inst: InstituteFixture): Promise<Record<string, string>> {
  const prisma = inst.s.prisma;
  const tables: { table_name: string }[] = await prisma.$queryRawUnsafe(
    `select table_name from information_schema.columns where column_name = 'institute_id' and table_schema = 'public' order by table_name`,
  );
  const out: Record<string, string> = {};
  for (const { table_name } of tables) {
    const rows: { h: string | null }[] = await prisma.$queryRawUnsafe(
      `select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) as h from "${table_name}" t where institute_id = $1`,
      inst.id,
    );
    out[table_name] = rows[0].h ?? '';
  }
  return out;
}
