import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class DisableTwoFactorDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be a 6-digit number' })
  code!: string;
}
