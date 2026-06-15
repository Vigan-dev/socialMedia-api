import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

const usernamePattern = /^[a-zA-Z0-9][a-zA-Z0-9._ -]{2,49}$/;
const avatarUrlPattern = /^(data:image\/|https?:\/\/)/;

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(usernamePattern, {
    message:
      'username can use letters, numbers, spaces, dots, underscores, or hyphens',
  })
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  bio?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  @MaxLength(2_000_000)
  @Matches(avatarUrlPattern, {
    message: 'avatarUrl must be an image data URL or HTTP(S) URL',
  })
  avatarUrl?: string | null;
}
