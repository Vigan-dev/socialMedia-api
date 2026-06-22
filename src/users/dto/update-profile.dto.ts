import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { avatarUploadUrlPattern } from '../../uploads/upload-url.validation';

const usernamePattern = /^[a-zA-Z0-9][a-zA-Z0-9._ -]{2,49}$/;

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
  @MaxLength(2048)
  @Matches(avatarUploadUrlPattern, {
    message: 'avatarUrl must reference an uploaded avatar image',
  })
  avatarUrl?: string | null;
}
