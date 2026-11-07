import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ExamsService } from './exams.service';
import { ExamRepository, ExamResultRepository } from './exam.repository';
import { SectionRepository } from '../sections/section.repository';
import { SectionSubjectRepository } from '../sections/section-subject.repository';
import { AcademicYearRepository } from '../academic-years/academic-year.repository';
import { ExamTypesService } from '../reference-data/exam-types/exam-types.service';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { TransactionHelper } from '../../database/transaction.helper';
import { TeacherScopeService } from '../sections/teacher-scope.service';
import {
  examStats,
  resultStatus,
  subjectAverages,
  validMark,
} from './exams.rules';

const D = (v: number) => new Prisma.Decimal(v);

describe('exam rules', () => {
  it('computes the status from the mark, the absent flag and the pass mark', () => {
    expect(resultStatus(null, true, 50)).toBe('ABSENT');
    expect(resultStatus(null, false, 50)).toBe('PENDING');
    expect(resultStatus(50, false, 50)).toBe('PASSED');
    expect(resultStatus(49.5, false, 50)).toBe('FAILED');
  });

  it('accepts marks between 0 and the maximum with two decimals', () => {
    expect(validMark(0, 100)).toBe(true);
    expect(validMark(100, 100)).toBe(true);
    expect(validMark(100.01, 100)).toBe(false);
    expect(validMark(-1, 100)).toBe(false);
    expect(validMark(10.555, 100)).toBe(false);
  });

  it('computes statistics and per-subject averages', () => {
    const stats = examStats(
      [
        { mark: 80, status: 'PASSED' },
        { mark: 40, status: 'FAILED' },
        { mark: null, status: 'ABSENT' },
      ],
      4,
    );
    expect(stats).toEqual({
      students: 4,
      graded: 2,
      passed: 1,
      failed: 1,
      absent: 1,
      pending: 1,
      average: 60,
    });
    expect(
      subjectAverages([
        { subjectId: 1, subjectName: 'رياضيات', mark: 15, maxMark: 20 },
        { subjectId: 1, subjectName: 'رياضيات', mark: null, maxMark: 20 },
        { subjectId: 1, subjectName: 'رياضيات', mark: 45, maxMark: 50 },
      ]),
    ).toEqual([
      { subjectId: 1, subjectName: 'رياضيات', exams: 3, averagePercent: 82.5 },
    ]);
  });
});

describe('ExamsService', () => {
  let service: ExamsService;
  let exams: any;
  let results: any;
  let sectionSubjects: any;
  let enrollments: any;
  let scope: any;

  const exam = {
    id: 9,
    sectionId: 2,
    subjectId: 5,
    examTypeId: null,
    examDate: new Date('2026-11-10'),
    maxMark: D(100),
    passMark: D(50),
  };

  beforeEach(async () => {
    // Not a teacher by default: no scope restriction
    scope = {
      taughtPairs: jest.fn<any>().mockResolvedValue(null),
      taughtSectionIds: jest.fn<any>().mockResolvedValue(null),
      assertTeachesSubject: jest.fn<any>().mockResolvedValue(undefined),
      assertTeachesSection: jest.fn<any>().mockResolvedValue(undefined),
    };
    exams = {
      create: jest.fn<any>().mockResolvedValue({ id: 9 }),
      findById: jest.fn<any>().mockResolvedValue(exam),
      findDetails: jest.fn<any>().mockResolvedValue(exam),
      update: jest.fn(),
      delete: jest.fn(),
    };
    results = {
      findByExam: jest.fn<any>().mockResolvedValue([]),
      findByExamWithStudents: jest.fn<any>().mockResolvedValue([]),
      countByExam: jest.fn<any>().mockResolvedValue(0),
      deleteByExam: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };
    sectionSubjects = {
      findBySectionAndSubject: jest.fn<any>().mockResolvedValue({ id: 1 }),
    };
    enrollments = {
      findStudentsTakingSubject: jest.fn<any>().mockResolvedValue([
        { id: 1, fullName: 'أحمد', familyName: null },
        { id: 2, fullName: 'سامر', familyName: null },
      ]),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ExamsService,
        { provide: ExamRepository, useValue: exams },
        { provide: ExamResultRepository, useValue: results },
        {
          provide: SectionRepository,
          useValue: {
            findById: jest
              .fn<any>()
              .mockResolvedValue({ id: 2, academicYearId: 3 }),
          },
        },
        { provide: SectionSubjectRepository, useValue: sectionSubjects },
        {
          provide: AcademicYearRepository,
          useValue: {
            findById: jest.fn<any>().mockResolvedValue({
              id: 3,
              startDate: new Date('2026-09-01'),
              endDate: new Date('2027-06-30'),
            }),
          },
        },
        { provide: ExamTypesService, useValue: { getById: jest.fn() } },
        { provide: EnrollmentsService, useValue: enrollments },
        {
          provide: TransactionHelper,
          useValue: { executeInTransaction: (fn: () => unknown) => fn() },
        },
        { provide: TeacherScopeService, useValue: scope },
      ],
    }).compile();
    service = moduleRef.get(ExamsService);
  });

  const createDto = {
    sectionId: 2,
    subjectId: 5,
    title: 'مذاكرة أولى',
    examDate: '2026-11-10',
    maxMark: 100,
    passMark: 50,
  };

  it('refuses a subject outside the section plan, a date outside the year and bad bounds', async () => {
    sectionSubjects.findBySectionAndSubject.mockResolvedValueOnce(null);
    await expect(service.create(createDto)).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      service.create({ ...createDto, examDate: '2027-08-01' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.create({ ...createDto, passMark: 120 }),
    ).rejects.toThrow(BadRequestException);
    await service.create(createDto);
    expect(exams.create).toHaveBeenCalledTimes(1);
  });

  it('lists eligible students from the enrollment rule with their marks', async () => {
    results.findByExamWithStudents.mockResolvedValue([
      {
        id: 7,
        studentId: 1,
        mark: D(80),
        status: 'PASSED',
        student: { id: 1, fullName: 'أحمد', family: null },
      },
    ]);
    const sheet = await service.getResults(9);
    expect(enrollments.findStudentsTakingSubject).toHaveBeenCalledWith(2, 5);
    expect(
      sheet.rows.map((r) => [r.student.id, r.result?.mark ?? null]),
    ).toEqual([
      [1, 80],
      [2, null],
    ]);
    expect(sheet.stats.pending).toBe(1);
  });

  it('upserts marks with a computed status', async () => {
    results.findByExam.mockResolvedValue([
      { id: 7, studentId: 1, mark: D(30), status: 'FAILED' },
    ]);
    await service.saveResults(9, {
      results: [
        { studentId: 1, mark: 75 },
        { studentId: 2, absent: true, mark: 90 },
      ],
    });
    expect(results.update).toHaveBeenCalledWith(7, {
      mark: D(75),
      status: 'PASSED',
    });
    expect(results.create).toHaveBeenCalledWith({
      examId: 9,
      studentId: 2,
      mark: null,
      status: 'ABSENT',
    });
  });

  it('refuses marks out of range and students not taking the subject', async () => {
    await expect(
      service.saveResults(9, { results: [{ studentId: 1, mark: 101 }] }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.saveResults(9, { results: [{ studentId: 99, mark: 10 }] }),
    ).rejects.toThrow(BadRequestException);
    expect(results.create).not.toHaveBeenCalled();
  });

  it('refuses deleting an exam with marks unless forced', async () => {
    results.countByExam.mockResolvedValue(3);
    await expect(service.delete(9, false)).rejects.toThrow(ConflictException);
    await service.delete(9, true);
    expect(results.deleteByExam).toHaveBeenCalledWith(9);
    expect(exams.delete).toHaveBeenCalledWith(9);
  });

  it('re-computes statuses when the pass mark changes, and refuses a max below a mark', async () => {
    results.findByExam.mockResolvedValue([
      { id: 7, studentId: 1, mark: D(55), status: 'PASSED' },
    ]);
    await service.update(9, { passMark: 60 });
    expect(results.update).toHaveBeenCalledWith(7, { status: 'FAILED' });
    await expect(
      service.update(9, { maxMark: 50, passMark: 40 }),
    ).rejects.toThrow(BadRequestException);
  });
  describe('teacher scope', () => {
    it('lists only the exams of the subjects the teacher teaches', async () => {
      exams.findFiltered = jest.fn<any>().mockResolvedValue({ data: [] });
      scope.taughtPairs.mockResolvedValue([{ sectionId: 2, subjectId: 5 }]);
      await service.findAll({ page: 1, limit: 20 } as never);
      expect(exams.findFiltered).toHaveBeenCalledWith(expect.anything(), [
        { sectionId: 2, subjectId: 5 },
      ]);
    });

    it('refuses marks for a subject the teacher does not teach', async () => {
      scope.assertTeachesSubject.mockRejectedValue(new ForbiddenException());
      await expect(
        service.saveResults(9, { results: [{ studentId: 1, mark: 50 }] }),
      ).rejects.toThrow(ForbiddenException);
      expect(results.create).not.toHaveBeenCalled();
      expect(scope.assertTeachesSubject).toHaveBeenCalledWith(2, 5);
    });
  });
});
