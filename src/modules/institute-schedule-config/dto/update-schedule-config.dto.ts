import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BreakItemDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'startTime must be in HH:mm format',
  })
  startTime!: string;

  @IsString()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'endTime must be in HH:mm format',
  })
  endTime!: string;
}

export class UpdateScheduleConfigDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  workingDays!: number[];

  @IsString()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'dayStartTime must be in HH:mm format',
  })
  dayStartTime!: string;

  @IsString()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'dayEndTime must be in HH:mm format',
  })
  dayEndTime!: string;

  @IsInt()
  @Min(15)
  @Max(180)
  periodDurationMinutes!: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BreakItemDto)
  breaks?: BreakItemDto[];

  /** Minutes after dayStartTime before a check-in counts as LATE (E8). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(180)
  lateAfterMinutes?: number;

  /** HH:mm when absences are marked; null = dayEndTime. */
  @IsOptional()
  @IsString()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'attendanceCloseTime must be in HH:mm format',
  })
  attendanceCloseTime?: string | null;
}
