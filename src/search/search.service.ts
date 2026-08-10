import { Injectable } from '@nestjs/common';
import { PostsService } from '../posts/posts.service';
import { UsersService } from '../users/users.service';
import type { UnifiedSearchQueryDto } from './dto/unified-search-query.dto';

@Injectable()
export class SearchService {
  constructor(
    private readonly postsService: PostsService,
    private readonly usersService: UsersService,
  ) {}

  async search(userId: string, query: UnifiedSearchQueryDto) {
    const requestedType = query.type ?? 'all';
    const include = (type: 'hashtags' | 'posts' | 'users') =>
      requestedType === 'all' || requestedType === type;
    const postQuery = {
      author: query.author,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      limit: query.limit,
      media: query.media ?? 'all',
      query: query.q,
    };

    const [users, posts, hashtags] = await Promise.all([
      include('users')
        ? this.usersService
            .findAll(userId, { limit: query.limit ?? '10', query: query.q })
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
      query: query.q.trim(),
      users,
    };
  }
}
