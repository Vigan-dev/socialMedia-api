import {
  ArrayMaxSize,
  IsArray,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { postMediaUploadUrlPattern } from '../../uploads/upload-url.validation';

export class UpdatePostDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(500)
  content?: string;

  @ValidateIf((_, value) => value !== undefined)
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
