import { PartialType } from '@nestjs/mapped-types';
import { CreateSectionDto } from './create-section.dto';

/**
 * DTO for updating an existing section.
 * All fields are optional.
 */
export class UpdateSectionDto extends PartialType(CreateSectionDto) {}
