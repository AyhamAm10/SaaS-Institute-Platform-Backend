import { IsInt, IsNotEmpty, IsOptional, IsPositive } from 'class-validator';

/**
 * DTO for assigning a subject to a section.
 */
export class AssignSubjectDto {
  @IsNotEmpty()
  @IsInt()
  @IsPositive()
  subjectId!: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  teacherId?: number | null;

  @IsOptional()
  @IsInt()
  @IsPositive()
  weeklyPeriods?: number;
}

