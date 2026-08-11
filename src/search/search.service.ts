import { BadRequestException, Injectable } from '@nestjs/common';
import { PostsService } from '../posts/posts.service';
import { UsersService } from '../users/users.service';
import type { UnifiedSearchQueryDto } from './dto/unified-search-query.dto';
import {
  normalizeUnifiedSearchText,
  UNIFIED_SEARCH_TEXT_MAX_LENGTH,
  UNIFIED_SEARCH_TEXT_MIN_LENGTH,
} from './search-text';

@Injectable()
export class SearchService {
  constructor(
    private readonly postsService: PostsService,
    private readonly usersService: UsersService,
  ) {}

  async search(userId: string, query: UnifiedSearchQueryDto) {
    const searchText = normalizeUnifiedSearchText(query.q);
    if (
      searchText.length < UNIFIED_SEARCH_TEXT_MIN_LENGTH ||
      searchText.length > UNIFIED_SEARCH_TEXT_MAX_LENGTH
    ) {
      throw new BadRequestException(
        `Search query must be between ${UNIFIED_SEARCH_TEXT_MIN_LENGTH} and ${UNIFIED_SEARCH_TEXT_MAX_LENGTH} characters`,
      );
    }

    const requestedType = query.type ?? 'all';
    const include = (type: 'hashtags' | 'posts' | 'users') =>
      requestedType === 'all' || requestedType === type;
    const postQuery = {
      author: query.author,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      limit: query.limit,
      media: query.media ?? 'all',
      query: searchText,
    };

    const [users, posts, hashtags] = await Promise.all([
      include('users')
        ? this.usersService
            .findAll(userId, {
              limit: query.limit ?? '10',
              query: searchText,
            })
            .then((page) => page.items)
        : Promise.resolve([]),
      include('posts')
        ? this.postsService.search(userId, postQuery)
        : Promise.resolve([]),
      include('hashtags')
        ? this.postsService.searchHashtags(userId, postQuery)
        : Promise.resolve([]),
    ]);

    return {
      filters: {
        author: query.author?.trim() ?? '',
        dateFrom: query.dateFrom ?? '',
        dateTo: query.dateTo ?? '',
        media: query.media ?? 'all',
        type: requestedType,
      },
      hashtags,
      posts,
      query: searchText,
      users,
    };
  }
}
