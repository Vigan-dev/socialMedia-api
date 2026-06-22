import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { avatarUploadUrlPattern } from '../../uploads/upload-url.validation';

export class UpdateAvatarDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  @MaxLength(2048)
  @Matches(avatarUploadUrlPattern, {
    message: 'avatarUrl must reference an uploaded avatar image',
  })
  avatarUrl?: string | null;
}
