import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { postMediaUploadUrlPattern } from '../../uploads/upload-url.validation';

export class CreatePostDto {
  @IsString()
  @MaxLength(500)
  content!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsString({ each: true })
  @MaxLength(2048, { each: true })
  @Matches(postMediaUploadUrlPattern, {
    each: true,
    message: 'mediaUrls must reference uploaded post media',
  })
  mediaUrls?: string[];
}
