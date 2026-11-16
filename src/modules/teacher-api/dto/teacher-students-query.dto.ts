import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsPositive } from 'class-validator';

export class TeacherStudentsQueryDto {
  /** Only the students who study this subject (must be one the teacher teaches in the section). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  subjectId?: number;
}
