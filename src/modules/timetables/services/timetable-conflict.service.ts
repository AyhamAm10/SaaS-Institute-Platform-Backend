import { Injectable } from '@nestjs/common';
import {
  ConflictSeverity,
  ConflictType,
  TimetableConflict,
} from '../domain/timetable-conflict.types';

function parseTimeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function doTimesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean {
  const sA = parseTimeToMinutes(startA);
  const eA = parseTimeToMinutes(endA);
  const sB = parseTimeToMinutes(startB);
  const eB = parseTimeToMinutes(endB);
  return Math.max(sA, sB) < Math.min(eA, eB);
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

export interface ConflictAuditContext {
  entries: Array<{
    id?: number;
    timetableId?: number;
    sectionId: number;
    sectionName?: string;
    academicBranchId?: number;
    subjectId: number;
    subjectName?: string;
    teacherId: number;
    teacherName?: string;
    roomId?: number | null;
    roomName?: string;
    dayOfWeek: number;
    periodNumber?: number | null;
    startTime: string;
    endTime: string;
    isLocked?: boolean;
  }>;
  allInstituteEntries?: Array<{
    id?: number;
    timetableId?: number;
    sectionId: number;
    sectionName?: string;
    subjectId: number;
    subjectName?: string;
    teacherId: number;
    teacherName?: string;
    roomId?: number | null;
    roomName?: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }>;
  sectionSubjects?: Array<{
    sectionId: number;
    subjectId: number;
    subjectName?: string;
    weeklyPeriods: number;
    teacherId?: number | null;
  }>;
  teacherAssignments?: Array<{
    teacherId: number;
    academicBranchId: number;
    subjectId: number;
  }>;
  teacherAvailabilities?: Array<{
    teacherId: number;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }>;
  roomAvailabilities?: Array<{
    roomId: number;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }>;
  scheduleConfig?: {
    workingDays: number[];
    dayStartTime: string;
    dayEndTime: string;
    breaks: Array<{ name: string; startTime: string; endTime: string }>;
  };
}

@Injectable()
export class TimetableConflictService {
  /**
   * Run comprehensive 8-dimensional timetable conflict audit.
   */
  detectConflicts(ctx: ConflictAuditContext): TimetableConflict[] {
    const conflicts: TimetableConflict[] = [];
    const entries = ctx.entries || [];
    const allEntries = ctx.allInstituteEntries || entries;

    // 1. Teacher double booking check (across all sections in institute)
    for (let i = 0; i < entries.length; i++) {
      const e1 = entries[i]!;

      for (let j = 0; j < allEntries.length; j++) {
        const e2 = allEntries[j]!;
        // Skip comparing an entry to itself
        if (e1.id && e2.id && e1.id === e2.id) continue;
        if (e1 === (e2 as any)) continue;

        if (
          e1.teacherId === e2.teacherId &&
          e1.dayOfWeek === e2.dayOfWeek &&
          e1.sectionId !== e2.sectionId &&
          doTimesOverlap(e1.startTime, e1.endTime, e2.startTime, e2.endTime)
        ) {
          conflicts.push({
            type: ConflictType.TEACHER_DOUBLE_BOOKING,
            severity: 'HARD',
            message: `المعلم (${e1.teacherName || e1.teacherId}) مجدول لشُعبتين في نفس الوقت: (${e1.sectionName || e1.sectionId}) و (${e2.sectionName || e2.sectionId})`,
            details: {
              dayOfWeek: e1.dayOfWeek,
              startTime: e1.startTime,
              endTime: e1.endTime,
              teacherId: e1.teacherId,
              teacherName: e1.teacherName,
              sectionId: e1.sectionId,
              sectionName: e1.sectionName,
            },
          });
        }
      }
    }

    // 2. Section double booking check (same section has multiple subjects at same time)
    for (let i = 0; i < entries.length; i++) {
      const e1 = entries[i]!;
      for (let j = i + 1; j < entries.length; j++) {
        const e2 = entries[j]!;
        if (
          e1.sectionId === e2.sectionId &&
          e1.dayOfWeek === e2.dayOfWeek &&
          doTimesOverlap(e1.startTime, e1.endTime, e2.startTime, e2.endTime)
        ) {
          conflicts.push({
            type: ConflictType.SECTION_DOUBLE_BOOKING,
            severity: 'HARD',
            message: `الشُعبة (${e1.sectionName || e1.sectionId}) لديها مادتان مجدولتان في نفس الوقت: (${e1.subjectName || e1.subjectId}) و (${e2.subjectName || e2.subjectId})`,
            details: {
              dayOfWeek: e1.dayOfWeek,
              startTime: e1.startTime,
              endTime: e1.endTime,
              sectionId: e1.sectionId,
              sectionName: e1.sectionName,
              subjectId: e1.subjectId,
              subjectName: e1.subjectName,
            },
          });
        }
      }
    }

    // 3. Room double booking check
    for (let i = 0; i < entries.length; i++) {
      const e1 = entries[i]!;
      if (!e1.roomId) continue;

      for (let j = 0; j < allEntries.length; j++) {
        const e2 = allEntries[j]!;
        if (e1.id && e2.id && e1.id === e2.id) continue;
        if (e1 === (e2 as any)) continue;
        if (!e2.roomId) continue;

        if (
          e1.roomId === e2.roomId &&
          e1.dayOfWeek === e2.dayOfWeek &&
          e1.sectionId !== e2.sectionId &&
          doTimesOverlap(e1.startTime, e1.endTime, e2.startTime, e2.endTime)
        ) {
          conflicts.push({
            type: ConflictType.ROOM_DOUBLE_BOOKING,
            severity: 'HARD',
            message: `القاعة (${e1.roomName || e1.roomId}) مخصصة لشُعبتين في نفس الوقت: (${e1.sectionName || e1.sectionId}) و (${e2.sectionName || e2.sectionId})`,
            details: {
              dayOfWeek: e1.dayOfWeek,
              startTime: e1.startTime,
              endTime: e1.endTime,
              roomId: e1.roomId,
              roomName: e1.roomName,
              sectionId: e1.sectionId,
              sectionName: e1.sectionName,
            },
          });
        }
      }
    }

    // 4. Teacher availability check
    if (ctx.teacherAvailabilities && ctx.teacherAvailabilities.length > 0) {
      for (const e of entries) {
        const allTeacherWins = ctx.teacherAvailabilities.filter(
          (a) => a.teacherId === e.teacherId,
        );
        if (allTeacherWins.length > 0) {
          const teacherWins = allTeacherWins.filter(
            (a) => a.dayOfWeek === e.dayOfWeek,
          );

          const isAvailable =
            teacherWins.length > 0 &&
            teacherWins.some((w) =>
              isTimeWithinWindow(e.startTime, e.endTime, w.startTime, w.endTime),
            );

          if (!isAvailable) {
            conflicts.push({
              type: ConflictType.TEACHER_UNAVAILABLE,
              severity: 'HARD',
              message: `المعلم (${e.teacherName || e.teacherId}) غير متاح في اليوم ${e.dayOfWeek} بين ${e.startTime} و ${e.endTime}`,
              details: {
                dayOfWeek: e.dayOfWeek,
                startTime: e.startTime,
                endTime: e.endTime,
                teacherId: e.teacherId,
                teacherName: e.teacherName,
                sectionId: e.sectionId,
                sectionName: e.sectionName,
              },
            });
          }
        }
      }
    }

    // 5. Room availability check
    if (ctx.roomAvailabilities && ctx.roomAvailabilities.length > 0) {
      for (const e of entries) {
        if (!e.roomId) continue;
        const allRoomWins = ctx.roomAvailabilities.filter(
          (a) => a.roomId === e.roomId,
        );
        if (allRoomWins.length > 0) {
          const roomWins = allRoomWins.filter(
            (a) => a.dayOfWeek === e.dayOfWeek,
          );

          const isAvailable =
            roomWins.length > 0 &&
            roomWins.some((w) =>
              isTimeWithinWindow(e.startTime, e.endTime, w.startTime, w.endTime),
            );

          if (!isAvailable) {
            conflicts.push({
              type: ConflictType.ROOM_UNAVAILABLE,
              severity: 'HARD',
              message: `القاعة (${e.roomName || e.roomId}) غير متاحة في اليوم ${e.dayOfWeek} بين ${e.startTime} و ${e.endTime}`,
              details: {
                dayOfWeek: e.dayOfWeek,
                startTime: e.startTime,
                endTime: e.endTime,
                roomId: e.roomId,
                roomName: e.roomName,
                sectionId: e.sectionId,
                sectionName: e.sectionName,
              },
            });
          }
        }
      }
    }

    // 6. Teacher qualification / assignment check
    if (ctx.teacherAssignments && ctx.teacherAssignments.length > 0) {
      for (const e of entries) {
        if (e.academicBranchId) {
          const isQualified = ctx.teacherAssignments.some(
            (a) =>
              a.teacherId === e.teacherId &&
              a.academicBranchId === e.academicBranchId &&
              a.subjectId === e.subjectId,
          );

          if (!isQualified) {
            conflicts.push({
              type: ConflictType.TEACHER_NOT_QUALIFIED,
              severity: 'HARD',
              message: `المعلم (${e.teacherName || e.teacherId}) غير مؤهل لتدريس مادة (${e.subjectName || e.subjectId}) في هذا الفرع الأكاديمي`,
              details: {
                teacherId: e.teacherId,
                teacherName: e.teacherName,
                subjectId: e.subjectId,
                subjectName: e.subjectName,
                sectionId: e.sectionId,
                sectionName: e.sectionName,
              },
            });
          }
        }
      }
    }

    // 7. Schedule configuration violation check (working days, day hours, breaks)
    if (ctx.scheduleConfig) {
      const cfg = ctx.scheduleConfig;
      const dayStartMins = parseTimeToMinutes(cfg.dayStartTime);
      const dayEndMins = parseTimeToMinutes(cfg.dayEndTime);

      for (const e of entries) {
        // Working day check
        if (!cfg.workingDays.includes(e.dayOfWeek)) {
          conflicts.push({
            type: ConflictType.SCHEDULE_CONFIG_VIOLATION,
            severity: 'HARD',
            message: `اليوم ${e.dayOfWeek} ليس من أيام الدوام المحددة في إعدادات المعهد`,
            details: {
              dayOfWeek: e.dayOfWeek,
              startTime: e.startTime,
              endTime: e.endTime,
              sectionId: e.sectionId,
            },
          });
        }

        // Hours check
        const sMins = parseTimeToMinutes(e.startTime);
        const eMins = parseTimeToMinutes(e.endTime);
        if (sMins < dayStartMins || eMins > dayEndMins) {
          conflicts.push({
            type: ConflictType.SCHEDULE_CONFIG_VIOLATION,
            severity: 'HARD',
            message: `الحصة (${e.startTime} - ${e.endTime}) تقع خارج أوقات الدوام الرسمي للمعهد (${cfg.dayStartTime} - ${cfg.dayEndTime})`,
            details: {
              dayOfWeek: e.dayOfWeek,
              startTime: e.startTime,
              endTime: e.endTime,
              sectionId: e.sectionId,
            },
          });
        }

        // Breaks check
        for (const b of cfg.breaks) {
          if (doTimesOverlap(e.startTime, e.endTime, b.startTime, b.endTime)) {
            conflicts.push({
              type: ConflictType.SCHEDULE_CONFIG_VIOLATION,
              severity: 'HARD',
              message: `الحصة (${e.startTime} - ${e.endTime}) تتداخل مع وقت استراحة المعهد (${b.name}: ${b.startTime} - ${b.endTime})`,
              details: {
                dayOfWeek: e.dayOfWeek,
                startTime: e.startTime,
                endTime: e.endTime,
                sectionId: e.sectionId,
              },
            });
          }
        }
      }
    }

    // 8. Weekly period quota check (for each section-subject assignment)
    if (ctx.sectionSubjects && ctx.sectionSubjects.length > 0) {
      for (const ss of ctx.sectionSubjects) {
        const scheduledCount = entries.filter(
          (e) => e.sectionId === ss.sectionId && e.subjectId === ss.subjectId,
        ).length;

        if (scheduledCount !== ss.weeklyPeriods) {
          conflicts.push({
            type: ConflictType.WEEKLY_PERIODS_MISMATCH,
            severity: 'SOFT',
            message: `مادة (${ss.subjectName || ss.subjectId}): تم جدولة ${scheduledCount} حصص بينما المطلوب ${ss.weeklyPeriods} حصة أسبوعياً`,
            details: {
              sectionId: ss.sectionId,
              subjectId: ss.subjectId,
              subjectName: ss.subjectName,
              requiredPeriods: ss.weeklyPeriods,
              scheduledPeriods: scheduledCount,
            },
          });
        }
      }
    }

    return conflicts;
  }
}
