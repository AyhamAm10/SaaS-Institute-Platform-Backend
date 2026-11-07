import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { AttendanceStatus } from '@prisma/client';

/** Check in / out one student. `at` defaults to now (ISO instant). */
export class AttendanceMarkDto {
  @IsInt()
  @IsPositive()
  studentId!: number;

  @IsOptional()
  @IsDateString()
  at?: string;
}

export class BulkAttendanceDto {
  @IsInt()
  @IsPositive()
  sectionId!: number;

  @IsIn(['check-in', 'check-out'])
  action!: 'check-in' | 'check-out';

  /** Default: every active student of the section. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(300)
  @IsInt({ each: true })
  @IsPositive({ each: true })
  studentIds?: number[];
}

/** Mark a student excused (or absent) for a day, with a note. */
export class ExcuseDto {
  @IsInt()
  @IsPositive()
  studentId!: number;

  /** Local date `YYYY-MM-DD`; default today. */
  @IsOptional()
  @IsDateString({ strict: true })
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** Admin correction of a record (audited). */
export class UpdateAttendanceDto {
  @IsOptional()
  @IsDateString()
  checkInAt?: string | null;

  @IsOptional()
  @IsDateString()
  checkOutAt?: string | null;

  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class DailyQueryDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  sectionId!: number;

  /** Local date; default today. */
  @IsOptional()
  @IsDateString({ strict: true })
  date?: string;
}

export class StudentAttendanceQueryDto {
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;
}
