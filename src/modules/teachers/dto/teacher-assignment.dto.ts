import { IsInt, IsPositive } from 'class-validator';

export class TeacherQualificationDto {
  @IsInt()
  @IsPositive()
  academicBranchId!: number;

  @IsInt()
  @IsPositive()
  subjectId!: number;
}
