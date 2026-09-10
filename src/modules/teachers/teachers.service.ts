import { Inject, Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { TeacherRepository } from './teacher.repository';
import { TeacherAssignmentRepository } from './teacher-assignment.repository';
import { TeacherAvailabilityRepository } from './teacher-availability.repository';
import { UserSystemRepository } from '../users/user-system.repository';
import { AcademicBranchRepository } from '../academic-branches/academic-branch.repository';
import { SubjectRepository } from '../subjects/subject.repository';
import { BranchRepository } from '../branches/branch.repository';
import { TransactionHelper } from '../../database/transaction.helper';
import { Ensure } from '../../common/errors/ensure';
import { ErrorMessages } from '../../common/errors/error-messages';
import { UserRole } from '../../common/types/user-role.enum';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { TeacherQueryDto } from './dto/teacher-query.dto';
import { TeacherQualificationDto } from './teacher-assignment.dto';
import { TeacherAvailabilityItemDto } from './teacher-availability.dto';

function parseTimeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

@Injectable()
export class TeachersService {
  constructor(
    @Inject(TeacherRepository)
    private readonly teacherRepository: TeacherRepository,
    @Inject(TeacherAssignmentRepository)
    private readonly assignmentRepository: TeacherAssignmentRepository,
    @Inject(TeacherAvailabilityRepository)
    private readonly availabilityRepository: TeacherAvailabilityRepository,
    @Inject(UserSystemRepository)
    private readonly userSystemRepository: UserSystemRepository,
    @Inject(AcademicBranchRepository)
    private readonly academicBranchRepository: AcademicBranchRepository,
    @Inject(SubjectRepository)
    private readonly subjectRepository: SubjectRepository,
    @Inject(BranchRepository)
    private readonly branchRepository: BranchRepository,
    @Inject(TransactionHelper)
    private readonly transactionHelper: TransactionHelper,
  ) {}

  /**
   * Validate availability time intervals for consistency and overlap prevention.
   */
  validateAvailabilityWindows(windows: TeacherAvailabilityItemDto[]): void {
    const windowsByDay: Record<number, TeacherAvailabilityItemDto[]> = {};

    for (const w of windows) {
      Ensure.custom(
        w.dayOfWeek < 0 || w.dayOfWeek > 6,
        ErrorMessages.get('invalid_day_of_week'),
        400,
      );

      const startMins = parseTimeToMinutes(w.startTime);
      const endMins = parseTimeToMinutes(w.endTime);

      Ensure.custom(
        startMins >= endMins,
        ErrorMessages.get('invalid_time_range'),
        400,
      );

      if (!windowsByDay[w.dayOfWeek]) {
        windowsByDay[w.dayOfWeek] = [];
      }
      windowsByDay[w.dayOfWeek]!.push(w);
    }

    // Check overlaps per day
    for (const day in windowsByDay) {
      const dayWindows = [...windowsByDay[day]!].sort(
        (a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime),
      );

      for (let i = 1; i < dayWindows.length; i++) {
        const prevEnd = parseTimeToMinutes(dayWindows[i - 1]!.endTime);
        const currStart = parseTimeToMinutes(dayWindows[i]!.startTime);
        Ensure.custom(
          currStart < prevEnd,
          ErrorMessages.get('overlapping_availability'),
          400,
        );
      }
    }
  }

  /**
   * Create a new Teacher.
   */
  async create(dto: CreateTeacherDto) {
    const trimmedPhone = dto.phone.trim();
    const trimmedName = dto.fullName.trim();
    Ensure.required(trimmedName, 'fullName');
    Ensure.required(trimmedPhone, 'phone');

    // 1. Validate phone uniqueness system-wide
    const existingUser = await this.userSystemRepository.findByPhone(trimmedPhone);
    Ensure.custom(
      Boolean(existingUser),
      ErrorMessages.get('teacher_phone_duplicate'),
      409,
    );

    // 2. Validate availability windows if provided
    if (dto.availabilities && dto.availabilities.length > 0) {
      this.validateAvailabilityWindows(dto.availabilities);
    }

    const defaultPassword = dto.password?.trim() || 'Teacher123!';
    const passwordHash = await bcrypt.hash(defaultPassword, 12);
    const instituteId = this.teacherRepository.getInstituteId();

    return this.transactionHelper.executeInTransaction(async () => {
      const client = (this.teacherRepository as any).client;

      // 3. Create User with role TEACHER
      const user = await client.user.create({
        data: {
          instituteId,
          fullName: trimmedName,
          phone: trimmedPhone,
          passwordHash,
          role: UserRole.TEACHER,
        },
      });

      // 4. Create Teacher record
      const teacher = await client.teacher.create({
        data: {
          instituteId,
          userId: user.id,
          specialization: dto.specialization?.trim() || null,
          isActive: true,
        },
      });

      // 5. Connect institute branches if provided
      if (dto.branchIds && dto.branchIds.length > 0) {
        for (const branchId of dto.branchIds) {
          const branch = await this.branchRepository.findById(branchId);
          if (branch) {
            await client.branchTeacher.create({
              data: {
                instituteId,
                branchId,
                teacherId: teacher.id,
              },
            });
          }
        }
      }

      // 6. Connect qualifications (TeacherAssignment) if provided
      if (dto.qualifications && dto.qualifications.length > 0) {
        for (const q of dto.qualifications) {
          const academicBranch = await this.academicBranchRepository.findById(q.academicBranchId);
          const subject = await this.subjectRepository.findById(q.subjectId);
          if (academicBranch && subject) {
            await client.teacherAssignment.create({
              data: {
                instituteId,
                teacherId: teacher.id,
                academicBranchId: q.academicBranchId,
                subjectId: q.subjectId,
              },
            });
          }
        }
      }

      // 7. Connect availabilities if provided
      if (dto.availabilities && dto.availabilities.length > 0) {
        await client.teacherAvailability.createMany({
          data: dto.availabilities.map((a) => ({
            instituteId,
            teacherId: teacher.id,
            dayOfWeek: a.dayOfWeek,
            startTime: a.startTime,
            endTime: a.endTime,
          })),
        });
      }

      return this.teacherRepository.findByIdWithDetails(teacher.id);
    });
  }

  /**
   * Update an existing teacher.
   */
  async update(id: number, dto: UpdateTeacherDto) {
    const teacher = await this.teacherRepository.findById(id);
    Ensure.exists(teacher, 'Teacher');

    const client = (this.teacherRepository as any).client;
    const user = await client.user.findUnique({ where: { id: teacher.userId } });
    Ensure.exists(user, 'User');

    // Phone uniqueness check if changed
    if (dto.phone !== undefined) {
      const trimmedPhone = dto.phone.trim();
      Ensure.required(trimmedPhone, 'phone');
      if (trimmedPhone !== user.phone) {
        const existing = await this.userSystemRepository.findByPhone(trimmedPhone);
        Ensure.custom(
          Boolean(existing && existing.id !== user.id),
          ErrorMessages.get('teacher_phone_duplicate'),
          409,
        );
      }
    }

    return this.transactionHelper.executeInTransaction(async () => {
      if (dto.fullName !== undefined || dto.phone !== undefined) {
        await client.user.update({
          where: { id: user.id },
          data: {
            ...(dto.fullName !== undefined ? { fullName: dto.fullName.trim() } : {}),
            ...(dto.phone !== undefined ? { phone: dto.phone.trim() } : {}),
          },
        });
      }

      const teacherUpdate: Record<string, unknown> = {};
      if (dto.specialization !== undefined) {
        teacherUpdate['specialization'] = dto.specialization ? dto.specialization.trim() : null;
      }
      if (dto.isActive !== undefined) {
        teacherUpdate['isActive'] = dto.isActive;
      }

      if (Object.keys(teacherUpdate).length > 0) {
        await this.teacherRepository.update(id, teacherUpdate);
      }

      if (dto.branchIds !== undefined) {
        const instituteId = this.teacherRepository.getInstituteId();
        await client.branchTeacher.deleteMany({
          where: { instituteId, teacherId: id },
        });

        for (const branchId of dto.branchIds) {
          const branch = await this.branchRepository.findById(branchId);
          if (branch) {
            await client.branchTeacher.create({
              data: {
                instituteId,
                branchId,
                teacherId: id,
              },
            });
          }
        }
      }

      return this.teacherRepository.findByIdWithDetails(id);
    });
  }

  /**
   * Activate or deactivate a teacher.
   */
  async toggleActive(id: number, isActive: boolean) {
    const teacher = await this.teacherRepository.findById(id);
    Ensure.exists(teacher, 'Teacher');
    return this.teacherRepository.update(id, { isActive });
  }

  /**
   * Find paginated teachers list with filters.
   */
  async findAll(query: TeacherQueryDto) {
    return this.teacherRepository.findAllFiltered(query);
  }

  /**
   * Retrieve single teacher details by ID.
   */
  async findById(id: number) {
    const teacher = await this.teacherRepository.findByIdWithDetails(id);
    Ensure.exists(teacher, 'Teacher');
    return teacher;
  }

  /**
   * Assign qualification (AcademicBranch + Subject) to a teacher.
   */
  async assignQualification(teacherId: number, dto: TeacherQualificationDto) {
    const teacher = await this.teacherRepository.findById(teacherId);
    Ensure.exists(teacher, 'Teacher');

    const academicBranch = await this.academicBranchRepository.findById(dto.academicBranchId);
    if (!academicBranch) {
      const rawBranch = await this.academicBranchRepository.findRawById(dto.academicBranchId);
      Ensure.custom(rawBranch !== null, ErrorMessages.get('academic_branch_mismatch'), 400);
      Ensure.exists(null, 'Academic branch');
    }

    const subject = await this.subjectRepository.findById(dto.subjectId);
    if (!subject) {
      const rawSubject = await this.subjectRepository.findRawById(dto.subjectId);
      Ensure.custom(rawSubject !== null, ErrorMessages.get('subject_mismatch'), 400);
      Ensure.exists(null, 'Subject');
    }

    const existing = await this.assignmentRepository.findByTeacherBranchSubject(
      teacherId,
      dto.academicBranchId,
      dto.subjectId,
    );
    Ensure.custom(
      Boolean(existing),
      ErrorMessages.get('teacher_assignment_duplicate'),
      409,
    );

    return this.assignmentRepository.create({
      teacherId,
      academicBranchId: dto.academicBranchId,
      subjectId: dto.subjectId,
    });
  }

  /**
   * Remove a teacher's qualification assignment.
   */
  async removeQualification(teacherId: number, assignmentId: number) {
    const teacher = await this.teacherRepository.findById(teacherId);
    Ensure.exists(teacher, 'Teacher');

    await this.assignmentRepository.deleteAssignment(assignmentId);
    return { success: true };
  }

  /**
   * Set weekly availability windows for a teacher.
   */
  async setAvailability(teacherId: number, windows: TeacherAvailabilityItemDto[]) {
    const teacher = await this.teacherRepository.findById(teacherId);
    Ensure.exists(teacher, 'Teacher');

    this.validateAvailabilityWindows(windows);

    return this.availabilityRepository.replaceAvailabilities(teacherId, windows);
  }

  /**
   * Retrieve availability windows for a teacher.
   */
  async getAvailability(teacherId: number) {
    const teacher = await this.teacherRepository.findById(teacherId);
    Ensure.exists(teacher, 'Teacher');
    return this.availabilityRepository.findByTeacher(teacherId);
  }
}
