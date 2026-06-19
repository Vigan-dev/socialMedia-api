import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const mediaUrlPattern = /^https?:\/\/.+/;

export class UpdatePostDto {
  @IsString()
  @MaxLength(500)
  content!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsString({ each: true })
  @MaxLength(2048, { each: true })
  @Matches(mediaUrlPattern, {
    each: true,
    message: 'mediaUrls must contain HTTP(S) URLs',
  })
  mediaUrls?: string[];
}
