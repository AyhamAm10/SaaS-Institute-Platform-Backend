import { Inject, Injectable } from '@nestjs/common';
import { InstituteScheduleConfigRepository } from './institute-schedule-config.repository';
import { Ensure } from '../../common/errors/ensure';
import { ErrorMessages } from '../../common/errors/error-messages';
import { UpdateScheduleConfigDto } from './dto/update-schedule-config.dto';
import {
  ScheduleConfigResponseDto,
  ScheduleSlot,
} from './dto/schedule-config-response.dto';

export const DEFAULT_SCHEDULE_CONFIG = {
  workingDays: [0, 1, 2, 3, 4], // Sunday to Thursday
  dayStartTime: '08:00',
  dayEndTime: '14:00',
  periodDurationMinutes: 45,
  breaks: [
    {
      name: 'استراحة',
      startTime: '10:15',
      endTime: '10:45',
    },
  ],
};

function parseTimeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function minutesToTimeString(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

@Injectable()
export class InstituteScheduleConfigService {
  constructor(
    @Inject(InstituteScheduleConfigRepository)
    private readonly repository: InstituteScheduleConfigRepository,
  ) {}

  /**
   * Calculate discrete lesson periods and break slots for the daily timetable.
   */
  calculateTimeSlots(
    dayStartTime: string,
    dayEndTime: string,
    periodDurationMinutes: number,
    breaks: Array<{ name: string; startTime: string; endTime: string }>,
  ): ScheduleSlot[] {
    const startMins = parseTimeToMinutes(dayStartTime);
    const endMins = parseTimeToMinutes(dayEndTime);

    const sortedBreaks = [...breaks].sort(
      (a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime),
    );

    const slots: ScheduleSlot[] = [];
    let currentMins = startMins;
    let periodIndex = 1;

    while (currentMins < endMins) {
      // Check if current time falls within or immediately starts a break
      const activeBreak = sortedBreaks.find(
        (b) =>
          parseTimeToMinutes(b.startTime) <= currentMins &&
          currentMins < parseTimeToMinutes(b.endTime),
      );

      if (activeBreak) {
        const breakEnd = parseTimeToMinutes(activeBreak.endTime);
        slots.push({
          type: 'BREAK',
          name: activeBreak.name,
          startTime: activeBreak.startTime,
          endTime: activeBreak.endTime,
          durationMinutes: breakEnd - parseTimeToMinutes(activeBreak.startTime),
        });
        currentMins = breakEnd;
        continue;
      }

      // Find next upcoming break
      const nextBreak = sortedBreaks.find(
        (b) => parseTimeToMinutes(b.startTime) > currentMins,
      );
      const nextCutoff = nextBreak ? parseTimeToMinutes(nextBreak.startTime) : endMins;

      // Can we fit a full period before next break or day end?
      if (currentMins + periodDurationMinutes <= nextCutoff) {
        const periodEndMins = currentMins + periodDurationMinutes;
        slots.push({
          type: 'LESSON',
          periodNumber: periodIndex++,
          startTime: minutesToTimeString(currentMins),
          endTime: minutesToTimeString(periodEndMins),
          durationMinutes: periodDurationMinutes,
        });
        currentMins = periodEndMins;
      } else {
        // If remaining time is smaller than a period, jump directly to the next cutoff
        currentMins = nextCutoff;
      }
    }

    return slots;
  }

  /**
   * Retrieve schedule configuration for current institute.
   * Auto-provisions standard defaults if not yet configured.
   */
  async getConfig(): Promise<ScheduleConfigResponseDto> {
    let config = await this.repository.findConfig();

    if (!config) {
      config = await this.repository.upsertConfig({
        workingDays: DEFAULT_SCHEDULE_CONFIG.workingDays,
        dayStartTime: DEFAULT_SCHEDULE_CONFIG.dayStartTime,
        dayEndTime: DEFAULT_SCHEDULE_CONFIG.dayEndTime,
        periodDurationMinutes: DEFAULT_SCHEDULE_CONFIG.periodDurationMinutes,
        breaks: DEFAULT_SCHEDULE_CONFIG.breaks,
      });
    }

    const breaks = (config.breaks as Array<{ name: string; startTime: string; endTime: string }>) || [];
    const slots = this.calculateTimeSlots(
      config.dayStartTime,
      config.dayEndTime,
      config.periodDurationMinutes,
      breaks,
    );

    return {
      id: config.id,
      instituteId: config.instituteId,
      workingDays: config.workingDays,
      dayStartTime: config.dayStartTime,
      dayEndTime: config.dayEndTime,
      periodDurationMinutes: config.periodDurationMinutes,
      breaks,
      slots,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }

  /**
   * Update institute schedule configuration with deep validation.
   */
  async updateConfig(dto: UpdateScheduleConfigDto): Promise<ScheduleConfigResponseDto> {
    const startMins = parseTimeToMinutes(dto.dayStartTime);
    const endMins = parseTimeToMinutes(dto.dayEndTime);

    // 1. Validate day start before end
    Ensure.custom(
      startMins >= endMins,
      ErrorMessages.get('schedule_config_invalid_times'),
      400,
    );

    const breaks = dto.breaks || [];

    // 2. Validate breaks
    const sortedBreaks = [...breaks].sort(
      (a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime),
    );

    for (let i = 0; i < sortedBreaks.length; i++) {
      const b = sortedBreaks[i]!;
      const bStart = parseTimeToMinutes(b.startTime);
      const bEnd = parseTimeToMinutes(b.endTime);

      Ensure.custom(
        bStart >= bEnd || bStart < startMins || bEnd > endMins,
        ErrorMessages.get('schedule_config_invalid_break'),
        400,
      );

      if (i > 0) {
        const prevEnd = parseTimeToMinutes(sortedBreaks[i - 1]!.endTime);
        Ensure.custom(
          bStart < prevEnd,
          ErrorMessages.get('overlapping_availability'),
          400,
        );
      }
    }

    // 3. Validate that at least 1 lesson period fits in the day
    const slots = this.calculateTimeSlots(
      dto.dayStartTime,
      dto.dayEndTime,
      dto.periodDurationMinutes,
      breaks,
    );

    const lessonSlots = slots.filter((s) => s.type === 'LESSON');
    Ensure.custom(
      lessonSlots.length === 0,
      ErrorMessages.get('schedule_config_no_periods'),
      400,
    );

    // 4. Persist
    const updated = await this.repository.upsertConfig({
      workingDays: dto.workingDays,
      dayStartTime: dto.dayStartTime,
      dayEndTime: dto.dayEndTime,
      periodDurationMinutes: dto.periodDurationMinutes,
      breaks: breaks,
    });

    return {
      id: updated.id,
      instituteId: updated.instituteId,
      workingDays: updated.workingDays,
      dayStartTime: updated.dayStartTime,
      dayEndTime: updated.dayEndTime,
      periodDurationMinutes: updated.periodDurationMinutes,
      breaks,
      slots,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }
}
