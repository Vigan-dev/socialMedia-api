import { IsIn, IsString, Matches, MaxLength } from 'class-validator';

const imageDataUrlPattern = /^data:image\/(png|jpe?g|webp|gif);base64,/i;

export class UploadImageDto {
  @IsString()
  @MaxLength(7_000_000)
  @Matches(imageDataUrlPattern, {
    message: 'dataUrl must be a supported image data URL',
  })
  dataUrl!: string;

  @IsString()
  @IsIn(['avatar', 'post-media'])
  purpose!: 'avatar' | 'post-media';
}
