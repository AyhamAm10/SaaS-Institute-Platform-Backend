import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * DTO for creating a new Academic Branch.
 * instituteId is resolved from request context.
 */
export class CreateAcademicBranchDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
