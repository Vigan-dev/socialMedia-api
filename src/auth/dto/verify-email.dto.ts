import { IsEmail, IsString, Length, MaxLength } from 'class-validator';

export class VerifyEmailDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @Length(64, 64)
  token!: string;
}
