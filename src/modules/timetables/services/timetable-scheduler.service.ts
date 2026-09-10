import { Injectable } from '@nestjs/common';
import {
  ScheduleConfigResponseDto,
  ScheduleSlot,
} from '../../institute-schedule-config/dto/schedule-config-response.dto';
import { TimetableConflict } from '../domain/timetable-conflict.types';
import { TimetableConflictService } from './timetable-conflict.service';

export interface SchedulerInput {
  sections: Array<{
    id: number;
    name: string;
    academicBranchId: number;
  }>;
  sectionSubjects: Array<{
    id: number;
    sectionId: number;
    subjectId: number;
    subjectName?: string;
    teacherId?: number | null;
    weeklyPeriods: number;
  }>;
  teachers: Array<{
    id: number;
    name?: string;
  }>;
  teacherAssignments: Array<{
    teacherId: number;
    academicBranchId: number;
    subjectId: number;
  }>;
  teacherAvailabilities: Array<{
    teacherId: number;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }>;
  rooms: Array<{
    id: number;
    name: string;
    capacity: number;
  }>;
  roomAvailabilities: Array<{
    roomId: number;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }>;
  scheduleConfig: ScheduleConfigResponseDto;
  existingEntries?: Array<{
    id?: number;
    timetableId?: number;
    sectionId: number;
    subjectId: number;
    teacherId: number;
    roomId?: number | null;
    dayOfWeek: number;
    periodNumber?: number | null;
    startTime: string;
    endTime: string;
    isLocked?: boolean;
  }>;
  options?: {
    incremental?: boolean;
    lockExisting?: boolean;
  };
}

export interface ScheduledLessonEntry {
  id?: number;
  timetableId?: number;
  sectionId: number;
  subjectId: number;
  teacherId: number;
  roomId: number | null;
  dayOfWeek: number;
  periodNumber: number;
  startTime: string;
  endTime: string;
  isLocked: boolean;
}

export interface SchedulerResult {
  success: boolean;
  entries: ScheduledLessonEntry[];
  conflicts: TimetableConflict[];
  unassignedRequirements: Array<{
    sectionId: number;
    subjectId: number;
    periodsRemaining: number;
    reason: string;
  }>;
}

function parseTimeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function isTimeWithinWindow(
  entryStart: string,
  entryEnd: string,
  winStart: string,
  winEnd: string,
): boolean {
  const eS = parseTimeToMinutes(entryStart);
  const eE = parseTimeToMinutes(entryEnd);
  const wS = parseTimeToMinutes(winStart);
  const wE = parseTimeToMinutes(winEnd);
  return eS >= wS && eE <= wE;
}

@Injectable()
export class TimetableSchedulerService {
  constructor(private readonly conflictService: TimetableConflictService) {}

  /**
   * Run automated timetable generator using deterministic constraint satisfaction.
   */
  async solve(input: SchedulerInput): Promise<SchedulerResult> {
    const isIncremental = Boolean(input.options?.incremental);
    const existingEntries = input.existingEntries || [];

    // 1. Identify locked / preserved entries
    const fixedEntries: ScheduledLessonEntry[] = [];
    if (isIncremental) {
      for (const e of existingEntries) {
        fixedEntries.push({
          id: e.id,
          timetableId: e.timetableId,
          sectionId: e.sectionId,
          subjectId: e.subjectId,
          teacherId: e.teacherId,
          roomId: e.roomId ?? null,
          dayOfWeek: e.dayOfWeek,
          periodNumber: e.periodNumber ?? 1,
          startTime: e.startTime,
          endTime: e.endTime,
          isLocked: e.isLocked ?? false,
        });
      }
    } else {
      // Only keep explicitly locked entries
      for (const e of existingEntries) {
        if (e.isLocked) {
          fixedEntries.push({
            id: e.id,
            timetableId: e.timetableId,
            sectionId: e.sectionId,
            subjectId: e.subjectId,
            teacherId: e.teacherId,
            roomId: e.roomId ?? null,
            dayOfWeek: e.dayOfWeek,
            periodNumber: e.periodNumber ?? 1,
            startTime: e.startTime,
            endTime: e.endTime,
            isLocked: true,
          });
        }
      }
    }

    // 2. Extract lesson slots from scheduleConfig
    const workingDays = input.scheduleConfig.workingDays || [];
    const rawSlots = input.scheduleConfig.slots || [];
    const lessonSlots = rawSlots.filter(
      (s): s is ScheduleSlot & { periodNumber: number } =>
        s.type === 'LESSON' && s.periodNumber !== undefined,
    );

    // 3. Build requirements list (lessons that still need to be scheduled)
    interface LessonRequirement {
      sectionId: number;
      subjectId: number;
      teacherId: number;
      academicBranchId: number;
    }

    const requirements: LessonRequirement[] = [];
    const unassigned: Array<{
      sectionId: number;
      subjectId: number;
      periodsRemaining: number;
      reason: string;
    }> = [];

    for (const ss of input.sectionSubjects) {
      const section = input.sections.find((s) => s.id === ss.sectionId);
      if (!section) continue;

      let teacherId = ss.teacherId;
      if (!teacherId) {
        // Find qualified teacher if not explicitly assigned
        const qualified = input.teacherAssignments.find(
          (a) =>
            a.academicBranchId === section.academicBranchId &&
            a.subjectId === ss.subjectId,
        );
        teacherId = qualified?.teacherId || null;
      }

      if (!teacherId) {
        unassigned.push({
          sectionId: ss.sectionId,
          subjectId: ss.subjectId,
          periodsRemaining: ss.weeklyPeriods,
          reason: 'لا يوجد معلم مؤهل أو مسند لتدريس هذه المادة لهذه الشُعبة',
        });
        continue;
      }

      // Subtract fixed entries count for this (section, subject)
      const alreadyScheduled = fixedEntries.filter(
        (e) => e.sectionId === ss.sectionId && e.subjectId === ss.subjectId,
      ).length;

      const remainingPeriods = Math.max(0, ss.weeklyPeriods - alreadyScheduled);

      for (let i = 0; i < remainingPeriods; i++) {
        requirements.push({
          sectionId: ss.sectionId,
          subjectId: ss.subjectId,
          teacherId,
          academicBranchId: section.academicBranchId,
        });
      }
    }

    // 4. Generate all available (dayOfWeek, slot) combinations
    interface TimeSlotLocation {
      dayOfWeek: number;
      slot: ScheduleSlot & { periodNumber: number };
    }

    const allSlots: TimeSlotLocation[] = [];
    for (const day of workingDays) {
      for (const slot of lessonSlots) {
        allSlots.push({ dayOfWeek: day, slot });
      }
    }

    // 5. Backtracking CSP solver state
    const currentAssignments: ScheduledLessonEntry[] = [...fixedEntries];

    // Helper functions for checking hard constraints against current state
    const isSlotAvailable = (
      req: LessonRequirement,
      loc: TimeSlotLocation,
      roomId: number | null,
    ): boolean => {
      // Hard constraint: Section double booking
      const sectionBusy = currentAssignments.some(
        (a) =>
          a.sectionId === req.sectionId &&
          a.dayOfWeek === loc.dayOfWeek &&
          a.startTime === loc.slot.startTime,
      );
      if (sectionBusy) return false;

      // Hard constraint: Teacher double booking
      const teacherBusy = currentAssignments.some(
        (a) =>
          a.teacherId === req.teacherId &&
          a.dayOfWeek === loc.dayOfWeek &&
          a.startTime === loc.slot.startTime,
      );
      if (teacherBusy) return false;

      // Hard constraint: Room double booking (if room specified)
      if (roomId) {
        const roomBusy = currentAssignments.some(
          (a) =>
            a.roomId === roomId &&
            a.dayOfWeek === loc.dayOfWeek &&
            a.startTime === loc.slot.startTime,
        );
        if (roomBusy) return false;
      }

      // Hard constraint: Teacher availability window
      const allTeacherWins = input.teacherAvailabilities.filter(
        (w) => w.teacherId === req.teacherId,
      );
      if (allTeacherWins.length > 0) {
        const teacherWins = allTeacherWins.filter(
          (w) => w.dayOfWeek === loc.dayOfWeek,
        );
        if (teacherWins.length === 0) return false;
        const withinWin = teacherWins.some((w) =>
          isTimeWithinWindow(loc.slot.startTime, loc.slot.endTime, w.startTime, w.endTime),
        );
        if (!withinWin) return false;
      }

      // Hard constraint: Room availability window
      if (roomId) {
        const allRoomWins = input.roomAvailabilities.filter(
          (w) => w.roomId === roomId,
        );
        if (allRoomWins.length > 0) {
          const roomWins = allRoomWins.filter(
            (w) => w.dayOfWeek === loc.dayOfWeek,
          );
          if (roomWins.length === 0) return false;
          const withinWin = roomWins.some((w) =>
            isTimeWithinWindow(loc.slot.startTime, loc.slot.endTime, w.startTime, w.endTime),
          );
          if (!withinWin) return false;
        }
      }

      return true;
    };

    // Soft heuristic score for a candidate placement
    const calculateSoftScore = (
      req: LessonRequirement,
      loc: TimeSlotLocation,
    ): number => {
      let score = 100;

      // Prefer spreading subject across different days:
      const sameSubjectOnDayCount = currentAssignments.filter(
        (a) =>
          a.sectionId === req.sectionId &&
          a.subjectId === req.subjectId &&
          a.dayOfWeek === loc.dayOfWeek,
      ).length;
      score -= sameSubjectOnDayCount * 30;

      // Prefer compactness: avoid wide idle gaps for section
      const sectionLessonsOnDay = currentAssignments
        .filter((a) => a.sectionId === req.sectionId && a.dayOfWeek === loc.dayOfWeek)
        .map((a) => a.periodNumber);

      if (sectionLessonsOnDay.length > 0) {
        const minP = Math.min(...sectionLessonsOnDay);
        const maxP = Math.max(...sectionLessonsOnDay);
        // Bonus if adjacent to an existing period
        if (loc.slot.periodNumber === minP - 1 || loc.slot.periodNumber === maxP + 1) {
          score += 15;
        }
      }

      return score;
    };

    // Available rooms list (default to null if no rooms defined)
    const availableRoomIds: Array<number | null> =
      input.rooms.length > 0 ? input.rooms.map((r) => r.id) : [null];

    // Sort requirements: MRV heuristic (schedule hardest subjects first)
    requirements.sort((a, b) => {
      const aTeacherWins = input.teacherAvailabilities.filter((w) => w.teacherId === a.teacherId).length;
      const bTeacherWins = input.teacherAvailabilities.filter((w) => w.teacherId === b.teacherId).length;
      return aTeacherWins - bTeacherWins;
    });

    // Backtracking search function
    const backtrack = (reqIndex: number): boolean => {
      if (reqIndex >= requirements.length) {
        return true; // All requirements satisfied!
      }

      const req = requirements[reqIndex]!;

      // Find valid candidates and sort by soft score
      interface CandidateOption {
        loc: TimeSlotLocation;
        roomId: number | null;
        score: number;
      }

      const candidates: CandidateOption[] = [];

      for (const loc of allSlots) {
        for (const roomId of availableRoomIds) {
          if (isSlotAvailable(req, loc, roomId)) {
            candidates.push({
              loc,
              roomId,
              score: calculateSoftScore(req, loc),
            });
          }
        }
      }

      // Sort by best score descending
      candidates.sort((a, b) => b.score - a.score);

      for (const cand of candidates) {
        const newEntry: ScheduledLessonEntry = {
          sectionId: req.sectionId,
          subjectId: req.subjectId,
          teacherId: req.teacherId,
          roomId: cand.roomId,
          dayOfWeek: cand.loc.dayOfWeek,
          periodNumber: cand.loc.slot.periodNumber,
          startTime: cand.loc.slot.startTime,
          endTime: cand.loc.slot.endTime,
          isLocked: false,
        };

        currentAssignments.push(newEntry);

        if (backtrack(reqIndex + 1)) {
          return true;
        }

        // Backtrack
        currentAssignments.pop();
      }

      return false;
    };

    const solved = backtrack(0);

    // Audit generated timetable for conflicts
    const conflicts = this.conflictService.detectConflicts({
      entries: currentAssignments,
      sectionSubjects: input.sectionSubjects,
      teacherAssignments: input.teacherAssignments,
      teacherAvailabilities: input.teacherAvailabilities,
      roomAvailabilities: input.roomAvailabilities,
      scheduleConfig: {
        workingDays: input.scheduleConfig.workingDays,
        dayStartTime: input.scheduleConfig.dayStartTime,
        dayEndTime: input.scheduleConfig.dayEndTime,
        breaks: input.scheduleConfig.breaks,
      },
    });

    return {
      success: solved && conflicts.filter((c) => c.severity === 'HARD').length === 0,
      entries: currentAssignments,
      conflicts,
      unassignedRequirements: unassigned,
    };
  }
}
