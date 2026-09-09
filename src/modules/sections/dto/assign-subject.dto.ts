import { IsInt, IsNotEmpty, IsPositive } from 'class-validator';

/**
 * DTO for assigning a subject to a section.
 */
export class AssignSubjectDto {
  @IsNotEmpty()
  @IsInt()
  @IsPositive()
  subjectId: number;
}
