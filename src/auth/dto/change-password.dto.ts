import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/[A-Z]/, {
    message: 'newPassword must include at least one uppercase letter',
  })
  @Matches(/[a-z]/, {
    message: 'newPassword must include at least one lowercase letter',
  })
  @Matches(/\d/, {
    message: 'newPassword must include at least one number',
  })
  newPassword!: string;
}
