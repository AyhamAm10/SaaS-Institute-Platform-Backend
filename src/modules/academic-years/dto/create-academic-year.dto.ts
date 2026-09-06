import { IsBoolean, IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for creating a new academic year.
 */
export class CreateAcademicYearDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsDateString()
  startDate: string;

  @IsNotEmpty()
  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isCurrent?: boolean;
}
