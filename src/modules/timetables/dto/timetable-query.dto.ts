import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsPositive } from 'class-validator';

export class TimetableQueryDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  academicYearId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  sectionId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  teacherId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  roomId?: number;
}
