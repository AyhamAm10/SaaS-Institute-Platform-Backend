import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsPositive, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination.dto';

export class StudentQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  branchId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  sectionId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  familyId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  statusId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  busId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  cityId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  schoolId?: number;

  /** Only students without an enrollment in this academic year. */
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  unassignedYearId?: number;
}
