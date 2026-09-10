export type ScheduleSlotType = 'LESSON' | 'BREAK';

export interface ScheduleSlot {
  type: ScheduleSlotType;
  periodNumber?: number;
  name?: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
}

export interface ScheduleConfigResponseDto {
  id: number;
  instituteId: number;
  workingDays: number[];
  dayStartTime: string;
  dayEndTime: string;
  periodDurationMinutes: number;
  breaks: Array<{ name: string; startTime: string; endTime: string }>;
  slots: ScheduleSlot[];
  createdAt: Date;
  updatedAt: Date;
}
