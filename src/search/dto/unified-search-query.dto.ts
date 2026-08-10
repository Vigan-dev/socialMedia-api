import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export const SEARCH_MEDIA_FILTERS = ['all', 'image', 'text'] as const;
export const SEARCH_RESULT_TYPES = [
  'all',
  'users',
  'posts',
  'hashtags',
] as const;

export type SearchMediaFilter = (typeof SEARCH_MEDIA_FILTERS)[number];
export type SearchResultType = (typeof SEARCH_RESULT_TYPES)[number];

export class UnifiedSearchQueryDto {
  @IsString()
  @Length(2, 80)
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
