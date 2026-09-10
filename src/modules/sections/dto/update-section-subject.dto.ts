import { IsInt, IsOptional, IsPositive } from 'class-validator';

export class UpdateSectionSubjectDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  teacherId?: number | null;

  @IsOptional()
  @IsInt()
  @IsPositive()
  weeklyPeriods?: number;
}
