import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { EnrollmentStatus } from '@prisma/client';
import { EnrollmentsService } from './enrollments.service';
import { EnrollmentSubjectRepository } from './enrollment-subject.repository';
import { StudentEnrollmentRepository } from '../students/student-enrollment.repository';
import { StudentRepository } from '../students/student.repository';
import { SectionRepository } from '../sections/section.repository';
import { SectionSubjectRepository } from '../sections/section-subject.repository';
import { TransactionHelper } from '../../database/transaction.helper';

const section = (id: number, branchId = 1, academicYearId = 10) => ({
  id,
  branchId,
  academicYearId,
});
const plan = (...ids: number[]) =>
  ids.map((id) => ({ subject: { id, name: `S${id}` } }));
const rosterRow = {
  id: 5,
  sectionId: 2,
  status: EnrollmentStatus.ACTIVE,
  statusReason: null,
  enrolledAt: new Date(),
  student: {
    id: 1,
    fullName: 'طالب',
    gender: 'MALE',
    branchId: 1,
    family: null,
    status: null,
  },
  subjects: [],
};
const active = {
  id: 5,
  studentId: 1,
  sectionId: 2,
  academicYearId: 10,
  status: EnrollmentStatus.ACTIVE,
};

describe('EnrollmentsService', () => {
  let service: EnrollmentsService;
  let enrollments: any;
  let enrollmentSubjects: any;
  let students: any;
  let sections: any;
  let sectionSubjects: any;

  beforeEach(async () => {
    enrollments = {
      findById: jest.fn(),
      findBySection: jest.fn(),
      findEnrolledStudentIds: jest.fn(),
      enroll: jest.fn(),
      update: jest.fn(),
      findRosterRow: jest.fn<any>().mockResolvedValue(rosterRow),
    };
    enrollmentSubjects = {
      findSubjectIds: jest.fn(),
      replace: jest.fn(),
      removeOutside: jest.fn(),
    };
    students = { findMany: jest.fn(), findById: jest.fn() };
    sections = { findById: jest.fn() };
    sectionSubjects = {
      findSubjectsBySection: jest.fn<any>().mockResolvedValue(plan(1, 2)),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        EnrollmentsService,
        { provide: StudentEnrollmentRepository, useValue: enrollments },
        { provide: EnrollmentSubjectRepository, useValue: enrollmentSubjects },
        { provide: StudentRepository, useValue: students },
        { provide: SectionRepository, useValue: sections },
        { provide: SectionSubjectRepository, useValue: sectionSubjects },
        {
          provide: TransactionHelper,
          useValue: { executeInTransaction: (fn: () => unknown) => fn() },
        },
      ],
    }).compile();
    service = moduleRef.get(EnrollmentsService);
  });

  describe('enrollStudents', () => {
    it('rejects another branch, a second enrollment and unknown students', async () => {
      sections.findById.mockResolvedValue(section(2, 1));
      students.findMany.mockResolvedValue([
        { id: 1, branchId: 1 },
        { id: 2, branchId: 9 },
        { id: 3, branchId: 1 },
      ]);
      enrollments.findEnrolledStudentIds.mockResolvedValue(new Set([3]));
      enrollments.enroll.mockResolvedValue({ id: 100 });

      const result = await service.enrollStudents(2, {
        studentIds: [1, 2, 3, 4, 1],
      });

      expect(result.enrolled).toEqual([{ studentId: 1, enrollmentId: 100 }]);
      expect(result.rejected.map((r) => r.studentId)).toEqual([2, 3, 4]);
      expect(enrollments.enroll).toHaveBeenCalledTimes(1);
      expect(enrollments.enroll).toHaveBeenCalledWith({
        studentId: 1,
        sectionId: 2,
        academicYearId: 10,
      });
    });
  });

  describe('transfer', () => {
    it('moves the enrollment and drops subjects missing in the new section', async () => {
      enrollments.findById.mockResolvedValue(active);
      sections.findById.mockResolvedValue(section(3, 1, 10));
      students.findById.mockResolvedValue({ id: 1, branchId: 1 });
      sectionSubjects.findSubjectsBySection.mockResolvedValue(plan(1, 7));

      await service.transfer(5, { sectionId: 3 });

      expect(enrollments.update).toHaveBeenCalledWith(5, { sectionId: 3 });
      expect(enrollmentSubjects.removeOutside).toHaveBeenCalledWith(5, [1, 7]);
    });

    it('refuses another academic year or another branch', async () => {
      enrollments.findById.mockResolvedValue(active);
      students.findById.mockResolvedValue({ id: 1, branchId: 1 });

      sections.findById.mockResolvedValue(section(3, 1, 11));
      await expect(service.transfer(5, { sectionId: 3 })).rejects.toThrow(
        BadRequestException,
      );

      sections.findById.mockResolvedValue(section(3, 2, 10));
      await expect(service.transfer(5, { sectionId: 3 })).rejects.toThrow(
        BadRequestException,
      );
      expect(enrollments.update).not.toHaveBeenCalled();
    });

    it('refuses a withdrawn enrollment and the same section', async () => {
      enrollments.findById.mockResolvedValue({
        ...active,
        status: EnrollmentStatus.WITHDRAWN,
      });
      await expect(service.transfer(5, { sectionId: 3 })).rejects.toThrow(
        BadRequestException,
      );
      enrollments.findById.mockResolvedValue(active);
      await expect(service.transfer(5, { sectionId: 2 })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('changeStatus', () => {
    it('requires a reason to withdraw and clears it on re-activation', async () => {
      enrollments.findById.mockResolvedValue(active);
      await expect(
        service.changeStatus(5, {
          status: EnrollmentStatus.WITHDRAWN,
          reason: '  ',
        }),
      ).rejects.toThrow(BadRequestException);

      enrollments.findById.mockResolvedValue({
        ...active,
        status: EnrollmentStatus.WITHDRAWN,
      });
      await service.changeStatus(5, {
        status: EnrollmentStatus.ACTIVE,
        reason: 'x',
      });
      expect(enrollments.update).toHaveBeenCalledWith(
        5,
        expect.objectContaining({ status: 'ACTIVE', statusReason: null }),
      );
    });

    it('refuses a completed enrollment going back to active', async () => {
      enrollments.findById.mockResolvedValue({
        ...active,
        status: EnrollmentStatus.COMPLETED,
      });
      await expect(
        service.changeStatus(5, { status: EnrollmentStatus.ACTIVE }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('setSubjects', () => {
    beforeEach(() => enrollments.findById.mockResolvedValue(active));

    it('refuses subjects that are not in the section plan', async () => {
      await expect(
        service.setSubjects(5, { subjectIds: [1, 9] }),
      ).rejects.toThrow(BadRequestException);
      expect(enrollmentSubjects.replace).not.toHaveBeenCalled();
    });

    it('stores a subset, and the full plan as all (empty)', async () => {
      await service.setSubjects(5, { subjectIds: [2] });
      expect(enrollmentSubjects.replace).toHaveBeenLastCalledWith(5, [2]);
      await service.setSubjects(5, { subjectIds: [2, 1] });
      expect(enrollmentSubjects.replace).toHaveBeenLastCalledWith(5, []);
    });
  });

  describe('getEffectiveSubjects', () => {
    it('returns the chosen subjects, or the section plan when none chosen', async () => {
      enrollments.findById.mockResolvedValue(active);
      enrollmentSubjects.findSubjectIds.mockResolvedValue([]);
      expect(await service.getEffectiveSubjects(5)).toEqual([1, 2]);
      enrollmentSubjects.findSubjectIds.mockResolvedValue([2]);
      expect(await service.getEffectiveSubjects(5)).toEqual([2]);
    });
  });

  describe('getSectionRoster', () => {
    it('marks students without a subset as taking every section subject', async () => {
      sections.findById.mockResolvedValue(section(2));
      enrollments.findBySection.mockResolvedValue([rosterRow]);
      const [item] = await service.getSectionRoster(2);
      expect(item.takesAllSubjects).toBe(true);
      expect(item.subjects.map((s) => s.id)).toEqual([1, 2]);
    });
  });

  describe('findStudentsTakingSubject', () => {
    it('keeps active students taking all subjects or a subset containing the subject', async () => {
      sections.findById.mockResolvedValue(section(2));
      const student = (id: number) => ({
        ...rosterRow.student,
        id,
        fullName: 'S' + id,
      });
      enrollments.findBySection.mockResolvedValue([
        { ...rosterRow, student: student(1), subjects: [] },
        {
          ...rosterRow,
          student: student(2),
          subjects: [{ subjectId: 2, subject: { id: 2, name: 'S2' } }],
        },
        {
          ...rosterRow,
          student: student(3),
          subjects: [{ subjectId: 1, subject: { id: 1, name: 'S1' } }],
        },
        {
          ...rosterRow,
          student: student(4),
          status: EnrollmentStatus.WITHDRAWN,
          subjects: [],
        },
      ]);
      const taking = await service.findStudentsTakingSubject(2, 1);
      expect(taking.map((s) => s.id)).toEqual([1, 3]);
    });
  });
});
