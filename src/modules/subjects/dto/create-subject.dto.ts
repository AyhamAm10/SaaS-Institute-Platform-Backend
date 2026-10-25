import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * DTO for creating a new Subject within an Institute.
 */
export class CreateSubjectDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  name: string;
}
