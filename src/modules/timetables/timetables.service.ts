import { Inject, Injectable } from '@nestjs/common';
import { TimetableRepository } from './timetable.repository';
import { TimetableEntryRepository } from './timetable-entry.repository';
import { TimetableConflictService } from './services/timetable-conflict.service';
import { TimetableSchedulerService } from './services/timetable-scheduler.service';
import { InstituteScheduleConfigService } from '../institute-schedule-config/institute-schedule-config.service';
import { SectionRepository } from '../sections/section.repository';
import { SectionSubjectRepository } from '../sections/section-subject.repository';
import { TeacherRepository } from '../teachers/teacher.repository';
import { TeacherAssignmentRepository } from '../teachers/teacher-assignment.repository';
import { TeacherAvailabilityRepository } from '../teachers/teacher-availability.repository';
import { RoomRepository } from '../rooms/room.repository';
import { RoomAvailabilityRepository } from '../rooms/room-availability.repository';
import { AcademicYearRepository } from '../academic-years/academic-year.repository';
import { TransactionHelper } from '../../database/transaction.helper';
import { Ensure } from '../../common/errors/ensure';
import { ErrorMessages } from '../../common/errors/error-messages';
import { GenerateTimetableDto } from './dto/generate-timetable.dto';
import { SaveTimetableEntryDto } from './dto/save-timetable-entry.dto';

@Injectable()
export class TimetablesService {
  constructor(
    @Inject(TimetableRepository)
    private readonly timetableRepository: TimetableRepository,
    @Inject(TimetableEntryRepository)
    private readonly entryRepository: TimetableEntryRepository,
    @Inject(TimetableConflictService)
    private readonly conflictService: TimetableConflictService,
    @Inject(TimetableSchedulerService)
    private readonly schedulerService: TimetableSchedulerService,
    @Inject(InstituteScheduleConfigService)
    private readonly configService: InstituteScheduleConfigService,
    @Inject(SectionRepository)
    private readonly sectionRepository: SectionRepository,
    @Inject(SectionSubjectRepository)
    private readonly sectionSubjectRepository: SectionSubjectRepository,
    @Inject(TeacherRepository)
    private readonly teacherRepository: TeacherRepository,
    @Inject(TeacherAssignmentRepository)
    private readonly teacherAssignmentRepository: TeacherAssignmentRepository,
    @Inject(TeacherAvailabilityRepository)
    private readonly teacherAvailabilityRepository: TeacherAvailabilityRepository,
    @Inject(RoomRepository)
    private readonly roomRepository: RoomRepository,
    @Inject(RoomAvailabilityRepository)
    private readonly roomAvailabilityRepository: RoomAvailabilityRepository,
    @Inject(AcademicYearRepository)
    private readonly academicYearRepository: AcademicYearRepository,
    @Inject(TransactionHelper)
    private readonly transactionHelper: TransactionHelper,
  ) {}

  /**
   * Retrieve timetable with full entries and conflict detection report.
   */
  async getTimetable(academicYearId: number, sectionId: number) {
    const section = await this.sectionRepository.findById(sectionId);
    Ensure.exists(section, 'Section');

    const year = await this.academicYearRepository.findById(academicYearId);
    Ensure.exists(year, 'Academic year');

    let timetable = await this.timetableRepository.findBySectionAndYear(
      sectionId,
      academicYearId,
    );

    if (!timetable) {
      timetable = await this.timetableRepository.upsertTimetable(
        academicYearId,
        sectionId,
        `جدول ${section.name}`,
      );
    }

    const fullTimetable = await this.timetableRepository.findWithEntries(timetable.id);
    const entries = fullTimetable?.entries || [];

    // All institute entries for cross-section collision checks
    const allInstituteEntries = await this.entryRepository.findInstituteEntriesForYear(academicYearId);
    const sectionSubjects = await this.sectionSubjectRepository.findSubjectsBySection(sectionId);

    // Retrieve teacher assignments & availabilities for assigned teachers
    const teacherIds = Array.from(new Set(entries.map((e: any) => e.teacherId)));
    const teacherAvailabilities: any[] = [];
    const teacherAssignments: any[] = [];

    for (const tId of teacherIds) {
      const wins = await this.teacherAvailabilityRepository.findByTeacher(tId);
      teacherAvailabilities.push(...wins);
      const assigns = await this.teacherAssignmentRepository.findByTeacher(tId);
      teacherAssignments.push(...assigns);
    }

    const roomAvailabilities = await this.roomAvailabilityRepository.findMany({});
    const scheduleConfig = await this.configService.getConfig();

    const conflicts = this.conflictService.detectConflicts({
      entries: entries.map((e: any) => ({
        id: e.id,
        timetableId: e.timetableId,
        sectionId,
        sectionName: section.name,
        academicBranchId: section.academicBranchId,
        subjectId: e.subjectId,
        subjectName: e.subject?.name,
        teacherId: e.teacherId,
        teacherName: e.teacher?.user?.fullName,
        roomId: e.roomId,
        roomName: e.room?.name,
        dayOfWeek: e.dayOfWeek,
        periodNumber: e.periodNumber,
        startTime: e.startTime,
        endTime: e.endTime,
        isLocked: e.isLocked,
      })),
      allInstituteEntries: allInstituteEntries.map((e: any) => ({
        id: e.id,
        timetableId: e.timetableId,
        sectionId: e.timetable?.sectionId,
        subjectId: e.subjectId,
        teacherId: e.teacherId,
        roomId: e.roomId,
        dayOfWeek: e.dayOfWeek,
        startTime: e.startTime,
        endTime: e.endTime,
      })),
      sectionSubjects: sectionSubjects.map((ss: any) => ({
        sectionId: ss.sectionId,
        subjectId: ss.subjectId,
        subjectName: ss.subject?.name,
        weeklyPeriods: ss.weeklyPeriods || 1,
        teacherId: ss.teacherId,
      })),
      teacherAssignments,
      teacherAvailabilities,
      roomAvailabilities,
      scheduleConfig,
    });

    return {
      ...fullTimetable,
      conflicts,
      stats: {
        totalEntries: entries.length,
        lockedEntries: entries.filter((e: any) => e.isLocked).length,
        hardConflicts: conflicts.filter((c) => c.severity === 'HARD').length,
        softConflicts: conflicts.filter((c) => c.severity === 'SOFT').length,
      },
    };
  }

  /**
   * Automatically generate timetable for a section using CSP solver.
   */
  async generateTimetable(dto: GenerateTimetableDto) {
    const year = await this.academicYearRepository.findById(dto.academicYearId);
    Ensure.exists(year, 'Academic year');

    // Single section or multi section
    const targetSectionIds = dto.sectionId
      ? [dto.sectionId]
      : dto.sectionIds && dto.sectionIds.length > 0
        ? dto.sectionIds
        : [];

    Ensure.custom(
      targetSectionIds.length === 0,
      'Section ID or Section IDs list is required for timetable generation',
      400,
    );

    const scheduleConfig = await this.configService.getConfig();

    const results: any[] = [];

    for (const secId of targetSectionIds) {
      const section = await this.sectionRepository.findById(secId);
      if (!section) continue;

      let timetable = await this.timetableRepository.findBySectionAndYear(
        secId,
        dto.academicYearId,
      );

      if (!timetable) {
        timetable = await this.timetableRepository.upsertTimetable(
          dto.academicYearId,
          secId,
          `جدول ${section.name}`,
        );
      }

      const existingFull = await this.timetableRepository.findWithEntries(timetable.id);
      const existingEntries = existingFull?.entries || [];

      // Section subjects with quota and teacher
      const sectionSubjects = await this.sectionSubjectRepository.findSubjectsBySection(secId);

      // Load all teachers, assignments, availabilities, rooms
      const teachers = await this.teacherRepository.findMany({});
      const teacherAssignments = await this.teacherAssignmentRepository.findMany({});
      const teacherAvailabilities = await this.teacherAvailabilityRepository.findMany({});
      const rooms = await this.roomRepository.findMany({});
      const roomAvailabilities = await this.roomAvailabilityRepository.findMany({});

      // Load all entries in institute for other sections to prevent collisions
      const allInstituteEntries = await this.entryRepository.findInstituteEntriesForYear(dto.academicYearId);
      const otherSectionEntries = allInstituteEntries.filter((e: any) => e.timetable?.sectionId !== secId);

      // Run solver
      const solveResult = await this.schedulerService.solve({
        sections: [section],
        sectionSubjects: sectionSubjects.map((ss: any) => ({
          id: ss.id,
          sectionId: ss.sectionId,
          subjectId: ss.subjectId,
          subjectName: ss.subject?.name,
          teacherId: ss.teacherId,
          weeklyPeriods: ss.weeklyPeriods || 1,
        })),
        teachers: teachers.map((t: any) => ({ id: t.id })),
        teacherAssignments,
        teacherAvailabilities,
        rooms: rooms.map((r: any) => ({ id: r.id, name: r.name, capacity: r.capacity })),
        roomAvailabilities,
        scheduleConfig,
        existingEntries: [
          ...existingEntries.map((e: any) => ({
            id: e.id,
            timetableId: e.timetableId,
            sectionId: secId,
            subjectId: e.subjectId,
            teacherId: e.teacherId,
            roomId: e.roomId,
            dayOfWeek: e.dayOfWeek,
            periodNumber: e.periodNumber,
            startTime: e.startTime,
            endTime: e.endTime,
            isLocked: e.isLocked,
          })),
          ...otherSectionEntries.map((e: any) => ({
            id: e.id,
            timetableId: e.timetableId,
            sectionId: e.timetable?.sectionId,
            subjectId: e.subjectId,
            teacherId: e.teacherId,
            roomId: e.roomId,
            dayOfWeek: e.dayOfWeek,
            periodNumber: e.periodNumber,
            startTime: e.startTime,
            endTime: e.endTime,
            isLocked: true, // Treat other sections as locked constraints
          })),
        ],
        options: {
          incremental: dto.incremental,
        },
      });

      // Filter entries belonging to THIS section
      const sectionGeneratedEntries = solveResult.entries.filter(
        (e) => e.sectionId === secId,
      );

      // Persist in transaction
      await this.transactionHelper.executeInTransaction(async () => {
        await this.entryRepository.replaceUnlockedEntries(
          timetable.id,
          sectionGeneratedEntries.filter((e) => !e.isLocked),
        );
      });

      const updated = await this.getTimetable(dto.academicYearId, secId);
      results.push({
        sectionId: secId,
        sectionName: section.name,
        success: solveResult.success,
        conflicts: solveResult.conflicts,
        unassigned: solveResult.unassignedRequirements,
        timetable: updated,
      });
    }

    return targetSectionIds.length === 1 ? results[0] : { sections: results };
  }

  /**
   * Save or update an individual timetable entry manually.
   */
  async saveEntry(timetableId: number, dto: SaveTimetableEntryDto, entryId?: number) {
    const timetable = await this.timetableRepository.findById(timetableId);
    Ensure.exists(timetable, 'Timetable');

    const teacher = await this.teacherRepository.findById(dto.teacherId);
    Ensure.exists(teacher, 'Teacher');

    if (dto.roomId) {
      const room = await this.roomRepository.findById(dto.roomId);
      Ensure.exists(room, 'Room');
    }

    if (entryId) {
      const existing = await this.entryRepository.findById(entryId);
      Ensure.exists(existing, 'Timetable entry');
      await this.entryRepository.updateEntry(entryId, dto);
    } else {
      await this.entryRepository.createEntry(timetableId, dto);
    }

    return this.getTimetable(timetable.academicYearId, timetable.sectionId);
  }

  /**
   * Delete an individual timetable entry.
   */
  async deleteEntry(timetableId: number, entryId: number) {
    const timetable = await this.timetableRepository.findById(timetableId);
    Ensure.exists(timetable, 'Timetable');

    const entry = await this.entryRepository.findById(entryId);
    Ensure.exists(entry, 'Timetable entry');

    await this.entryRepository.deleteEntry(entryId);
    return this.getTimetable(timetable.academicYearId, timetable.sectionId);
  }

  /**
   * Toggle lock status on an entry for incremental scheduling.
   */
  async toggleLock(timetableId: number, entryId: number, isLocked: boolean) {
    const timetable = await this.timetableRepository.findById(timetableId);
    Ensure.exists(timetable, 'Timetable');

    const entry = await this.entryRepository.findById(entryId);
    Ensure.exists(entry, 'Timetable entry');

    await this.entryRepository.toggleLock(entryId, isLocked);
    return this.getTimetable(timetable.academicYearId, timetable.sectionId);
  }

  /**
   * Get conflict audit report for a timetable.
   */
  async getConflicts(timetableId: number) {
    const timetable = await this.timetableRepository.findById(timetableId);
    Ensure.exists(timetable, 'Timetable');
    const result = await this.getTimetable(timetable.academicYearId, timetable.sectionId);
    return result.conflicts;
  }
}
