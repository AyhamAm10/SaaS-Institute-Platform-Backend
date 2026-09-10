import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class SaveTimetableEntryDto {
  @IsInt()
  @IsPositive()
  subjectId!: number;

  @IsInt()
  @IsPositive()
  teacherId!: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  roomId?: number | null;

  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  periodNumber?: number;

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

  @IsOptional()
  @IsBoolean()
  isLocked?: boolean;
}
