import { jest } from '@jest/globals';
import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { RequestContext } from '../../context/request-context';
import { TeacherAccessService } from './teacher-access.service';
import { TeacherContextService } from './teacher-context.service';
import { TeacherOverviewService } from './teacher-overview.service';
import { TeacherStudyService } from './teacher-study.service';

const asTeacher = <T>(fn: () => Promise<T>) =>
  RequestContext.run(
    { userId: 42, instituteId: 1, role: 'TEACHER', language: 'ar' },
    fn,
  );

const assignment = (over: object = {}) => ({
  sectionId: 3,
  sectionName: 'التاسع أ',
  grade: '9',
  branchId: 2,
  branchName: 'فرع المزة',
  academicYearId: 7,
  subjectId: 5,
  subjectName: 'الرياضيات',
  weeklyPeriods: 4,
  ...over,
});

describe('TeacherAccessService', () => {
  let teachers: any;
  let sections: any;
  let years: any;
  let access: TeacherAccessService;

  beforeEach(() => {
    teachers = {
      findByUserId: jest.fn<any>().mockResolvedValue({ id: 5, isActive: true }),
      findByIdWithDetails: jest.fn<any>().mockResolvedValue({
        user: { fullName: 'أ. سامر', phone: '0955' },
        specialization: 'رياضيات',
        branchTeachers: [{ branch: { id: 2, name: 'فرع المزة' } }],
        availabilities: [{ dayOfWeek: 6, startTime: '08:00', endTime: '12:00' }],
      }),
    };
    sections = { getTaughtAssignments: jest.fn<any>().mockResolvedValue([assignment()]) };
    years = { findCurrentYearId: jest.fn<any>().mockResolvedValue(7) };
    access = new TeacherAccessService(teachers, sections, years);
  });

  it('returns the live teacher with branches and availability', async () => {
    const caller = await asTeacher(() => access.caller());
    expect(caller).toEqual(
      expect.objectContaining({
        teacherId: 5,
        fullName: 'أ. سامر',
        branches: [{ id: 2, name: 'فرع المزة' }],
      }),
    );
  });

  it('refuses a user without a teacher record and a deactivated teacher', async () => {
    teachers.findByUserId.mockResolvedValue(null);
    await expect(asTeacher(() => access.caller())).rejects.toThrow(ForbiddenException);
    teachers.findByUserId.mockResolvedValue({ id: 5, isActive: false });
    await expect(asTeacher(() => access.caller())).rejects.toThrow(UnauthorizedException);
  });

  it('uses the header year, else the current year', async () => {
    expect(await asTeacher(() => access.yearId())).toBe(7);
    const withHeader = RequestContext.run(
      { userId: 42, instituteId: 1, role: 'TEACHER', language: 'ar', academicYearId: 9 },
      () => access.yearId(),
    );
    expect(await withHeader).toBe(9);
  });

  it('answers 404 for a section the teacher does not teach', async () => {
    const caller = await asTeacher(() => access.caller());
    await expect(access.ownSection(caller, 99)).rejects.toThrow(NotFoundException);
    expect(await access.ownSection(caller, 3)).toHaveLength(1);
  });
});

describe('TeacherStudyService', () => {
  let access: any;
  let enrollments: any;
  let study: TeacherStudyService;

  beforeEach(() => {
    access = {
      caller: jest.fn<any>().mockResolvedValue({ teacherId: 5 }),
      yearId: jest.fn<any>().mockResolvedValue(7),
      assignments: jest.fn<any>().mockResolvedValue([
        assignment(),
        assignment({ subjectId: 6, subjectName: 'الفيزياء' }),
        assignment({ sectionId: 4, sectionName: 'التاسع ب', subjectId: 5 }),
      ]),
      ownSection: jest.fn<any>().mockResolvedValue([assignment(), assignment({ subjectId: 6 })]),
    };
    enrollments = {
      getActiveStudentSections: jest.fn<any>().mockResolvedValue([
        { studentId: 1, sectionId: 3 },
        { studentId: 2, sectionId: 3 },
        { studentId: 3, sectionId: 4 },
        { studentId: 4, sectionId: 99 },
      ]),
      getYearEnrollments: jest.fn<any>().mockResolvedValue([
        { student: { id: 1, fullName: 'ليلى', gender: 'FEMALE', family: { familyName: 'خالد', phone: '0933' } } },
        { student: { id: 2, fullName: 'سامي', gender: 'MALE', family: null } },
      ]),
      findStudentsTakingSubject: jest.fn<any>().mockResolvedValue([{ id: 1 }]),
    };
    study = new TeacherStudyService(
      access,
      new TeacherContextService(),
      { getEntriesForReport: jest.fn<any>().mockResolvedValue([]) } as any,
      enrollments,
      { getConfig: jest.fn<any>().mockResolvedValue({ workingDays: [6], breaks: [] }) } as any,
    );
  });

  it('groups the teacher subjects per section and counts only that section students', async () => {
    const sections = await asTeacher(() => study.getSections());
    expect(sections.map((s) => [s.sectionId, s.studentCount, s.subjects.length])).toEqual([
      [3, 2, 2],
      [4, 1, 1],
    ]);
    expect(sections[0]).toEqual(
      expect.objectContaining({ branchId: 2, branchName: 'فرع المزة', academicYearId: 7 }),
    );
  });

  it('has no sections without a current year', async () => {
    access.yearId.mockResolvedValue(null);
    expect(await asTeacher(() => study.getSections())).toEqual([]);
  });

  it('lists the roster with the guardian phone and nothing else about the family', async () => {
    const result = await asTeacher(() => study.getStudents(3, {}));
    expect(result.students).toEqual([
      { id: 1, fullName: 'ليلى', gender: 'FEMALE', familyName: 'خالد', guardianPhone: '0933' },
      { id: 2, fullName: 'سامي', gender: 'MALE', familyName: null, guardianPhone: null },
    ]);
    expect(result.section).toEqual({ id: 3, name: 'التاسع أ', branchId: 2, academicYearId: 7 });
  });

  it('filters the roster to the students of one of the teacher subjects', async () => {
    const result = await asTeacher(() => study.getStudents(3, { subjectId: 5 }));
    expect(result.students.map((s) => s.id)).toEqual([1]);
  });

  it('refuses a subject the teacher does not teach in that section', async () => {
    await expect(asTeacher(() => study.getStudents(3, { subjectId: 77 }))).rejects.toThrow(
      ForbiddenException,
    );
  });
});

describe('TeacherOverviewService', () => {
  const exam = (id: number, title: string, date: string) => ({
    id, title, examDate: new Date(`${date}T00:00:00Z`),
    section: { id: 3, name: 'التاسع أ' }, subject: { id: 5, name: 'الرياضيات' },
  });
  let exams: any;
  let overview: TeacherOverviewService;

  beforeEach(() => {
    exams = {
      findAll: jest
        .fn<any>()
        .mockResolvedValueOnce({ data: [exam(11, 'ب', '2026-11-20'), exam(10, 'أ', '2026-11-16')] })
        .mockResolvedValueOnce({ data: [exam(8, 'قديمة', '2026-11-05'), exam(9, 'مكتملة', '2026-11-02')] }),
      getResults: jest
        .fn<any>()
        .mockImplementation(async (id: number) => ({ stats: { pending: id === 8 ? 4 : 0 } })),
    };
    overview = new TeacherOverviewService(
      {
        caller: jest.fn<any>().mockResolvedValue({ teacherId: 5 }),
        yearId: jest.fn<any>().mockResolvedValue(7),
      } as any,
      new TeacherContextService(),
      { localParts: jest.fn<any>().mockResolvedValue({ date: '2026-11-15', minutesOfDay: 9 * 60 + 5, dayOfWeek: 0 }) } as any,
      { getConfig: jest.fn<any>().mockResolvedValue({ workingDays: [6, 0, 1] }) } as any,
      {
        getEntriesForReport: jest.fn<any>().mockResolvedValue([
          { id: 1, dayOfWeek: 0, periodNumber: 1, startTime: '08:00', endTime: '08:45', timetable: { section: { id: 3, name: 'التاسع أ' } }, subject: { id: 5, name: 'الرياضيات' }, room: null },
          { id: 2, dayOfWeek: 1, periodNumber: 1, startTime: '08:00', endTime: '08:45', timetable: { section: { id: 3, name: 'التاسع أ' } }, subject: { id: 5, name: 'الرياضيات' }, room: null },
        ]),
      } as any,
      exams,
    );
  });

  it('shows today lessons and the institute-local time, with no attendance part', async () => {
    const result = await asTeacher(() => overview.getOverview());
    expect(result.date).toBe('2026-11-15');
    expect(result.now).toBe('09:05');
    expect(result.isWorkingDay).toBe(true);
    expect(result.lessons.map((l) => l.id)).toEqual([1]);
    expect('attendance' in result).toBe(false);
  });

  it('lists upcoming exams soonest first and only the recent exams with pending marks', async () => {
    const result = await asTeacher(() => overview.getOverview());
    expect(result.upcomingExams.map((e) => e.examId)).toEqual([10, 11]);
    expect(result.pendingMarks).toEqual([expect.objectContaining({ examId: 8, pending: 4 })]);
  });
});
