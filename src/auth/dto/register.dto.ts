import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const usernamePattern = /^[a-zA-Z0-9][a-zA-Z0-9._ -]{2,49}$/;

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(50)
  @Matches(usernamePattern, {
    message:
      'username can use letters, numbers, spaces, dots, underscores, or hyphens',
  })
  username!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

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
