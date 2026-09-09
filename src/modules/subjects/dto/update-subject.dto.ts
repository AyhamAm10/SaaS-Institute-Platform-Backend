import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * DTO for updating an existing Subject.
 */
export class UpdateSubjectDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;
}
