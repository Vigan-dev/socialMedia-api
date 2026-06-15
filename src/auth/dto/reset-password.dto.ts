import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ResetPasswordDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(32)
  @MaxLength(128)
  token!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/[A-Z]/, {
    message: 'password must include at least one uppercase letter',
  })
  @Matches(/[a-z]/, {
    message: 'password must include at least one lowercase letter',
  })
  @Matches(/\d/, {
    message: 'password must include at least one number',
  })
  password!: string;
}
