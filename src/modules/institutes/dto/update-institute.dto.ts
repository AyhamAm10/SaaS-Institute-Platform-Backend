import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateInstituteDto } from './create-institute.dto';

/**
 * DTO for updating institute details (super admin). The initial admin
 * account fields are creation-only.
 */
export class UpdateInstituteDto extends PartialType(
  OmitType(CreateInstituteDto, [
    'adminFullName',
    'adminPhone',
    'adminPassword',
  ] as const),
) {}
