import { IsEmail, MaxLength } from 'class-validator';

export class ResendEmailVerificationDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
