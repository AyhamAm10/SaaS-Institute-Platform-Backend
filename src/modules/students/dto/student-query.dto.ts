import { Type, Transform } from 'class-transformer';
import { IsInt, IsOptional, IsPositive, IsString, IsBoolean } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination.dto';

export class StudentQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

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

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  knowWayId?: number;

  @IsOptional()
  @IsString()
  customFilters?: string;

  /**
   * Only students without an enrollment in the context academic year (header
   * year, else the current one). The year itself is never a query parameter.
   */
  @IsOptional()
  @Transform(({ value }) => (value === 'true' || value === true ? true : value === 'false' || value === false ? false : undefined))
  @IsBoolean()
  unassigned?: boolean;
}
