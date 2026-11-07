import { PartialType } from '@nestjs/mapped-types';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Create payload of the name-only lookups (cities, know-ways, exam types). */
export class CreateLookupDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  name: string;
}

export class UpdateLookupDto extends PartialType(CreateLookupDto) {}
