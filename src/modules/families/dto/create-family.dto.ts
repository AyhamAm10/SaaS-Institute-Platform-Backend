import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateFamilyDto {
  @IsString()
  @IsNotEmpty()
  familyName: string;

  @IsString()
  @IsOptional()
  fatherName?: string;

  @IsString()
  @IsOptional()
  motherName?: string;

  @IsString()
  @IsOptional()
  phone?: string;
}
