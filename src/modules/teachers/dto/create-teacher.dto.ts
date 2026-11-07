import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { STAFF_PASSWORD_MIN } from '../../staff/dto/staff.dto';
import { TeacherQualificationDto } from './teacher-assignment.dto';
import { TeacherAvailabilityItemDto } from './teacher-availability.dto';

export class CreateTeacherDto {
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsString()
  @Matches(/^\+?[0-9]{8,15}$/, {
    message: 'phone must be a valid phone number (8-15 digits)',
  })
  phone!: string;

  @IsString()
  @MinLength(STAFF_PASSWORD_MIN)
  @MaxLength(100)
  password!: string;

  @IsOptional()
  @IsString()
  specialization?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  branchIds?: number[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TeacherQualificationDto)
  qualifications?: TeacherQualificationDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TeacherAvailabilityItemDto)
  availabilities?: TeacherAvailabilityItemDto[];
}
