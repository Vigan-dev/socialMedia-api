import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

const avatarUrlPattern = /^(data:image\/|https?:\/\/)/;

export class UpdateAvatarDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  @MaxLength(2_000_000)
  @Matches(avatarUrlPattern, {
    message: 'avatarUrl must be an image data URL or HTTP(S) URL',
  })
  avatarUrl?: string | null;
}
