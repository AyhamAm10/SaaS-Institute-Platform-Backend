import { ArrayMaxSize, IsArray, IsInt, IsPositive } from 'class-validator';

/** Subjects the student takes; an empty list means every section subject. */
export class SetEnrollmentSubjectsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  @IsPositive({ each: true })
  subjectIds!: number[];
}
