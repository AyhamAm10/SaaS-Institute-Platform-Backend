import { IsString, MinLength } from 'class-validator';

export class ResetMobilePasswordDto {
  @IsString()
  @MinLength(8)
  password!: string;
}

