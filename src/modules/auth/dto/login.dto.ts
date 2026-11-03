import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @IsNotEmpty()
  @IsString()
  phone: string;

  @IsNotEmpty()
  @IsString()
  password: string;

  /**
   * Institute login code. Optional: only needed when the same phone and
   * password belong to accounts in more than one institute.
   */
  @IsOptional()
  @IsString()
  instituteCode?: string;
}
