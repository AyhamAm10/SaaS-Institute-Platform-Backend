import { IsArray, IsBoolean, IsInt, IsOptional, IsPositive } from 'class-validator';

export class GenerateTimetableDto {
  @IsInt()
  @IsPositive()
  academicYearId!: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  sectionId?: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  sectionIds?: number[];

  @IsOptional()
  @IsBoolean()
  incremental?: boolean;

  @IsOptional()
  @IsBoolean()
  clearExisting?: boolean;
}
