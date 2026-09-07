import { PartialType } from '@nestjs/mapped-types';
import { CreateAcademicBranchDto } from './create-academic-branch.dto';

export class UpdateAcademicBranchDto extends PartialType(CreateAcademicBranchDto) {}
