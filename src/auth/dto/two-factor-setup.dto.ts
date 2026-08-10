import { IsString, MaxLength, MinLength } from 'class-validator';

export class TwoFactorSetupDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
