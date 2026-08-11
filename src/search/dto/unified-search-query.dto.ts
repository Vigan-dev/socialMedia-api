import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import {
  normalizeUnifiedSearchText,
  UNIFIED_SEARCH_TEXT_MAX_LENGTH,
  UNIFIED_SEARCH_TEXT_MIN_LENGTH,
} from '../search-text';

export const SEARCH_MEDIA_FILTERS = ['all', 'image', 'text'] as const;
export const SEARCH_RESULT_TYPES = [
  'all',
  'users',
  'posts',
  'hashtags',
] as const;

export type SearchMediaFilter = (typeof SEARCH_MEDIA_FILTERS)[number];
export type SearchResultType = (typeof SEARCH_RESULT_TYPES)[number];

function transformSearchText(parameters: TransformFnParams): unknown {
  const value = parameters.value as unknown;
  return typeof value === 'string' ? normalizeUnifiedSearchText(value) : value;
}

export class UnifiedSearchQueryDto {
  @Transform(transformSearchText)
  @IsString()
  @Length(UNIFIED_SEARCH_TEXT_MIN_LENGTH, UNIFIED_SEARCH_TEXT_MAX_LENGTH)
  q!: string;

  @IsOptional()
  @IsIn(SEARCH_RESULT_TYPES)
  type: SearchResultType = 'all';

  @IsOptional()
  @IsIn(SEARCH_MEDIA_FILTERS)
  media: SearchMediaFilter = 'all';

  @IsOptional()
  @IsString()
  @MaxLength(50)
  author?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  dateFrom?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  dateTo?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
