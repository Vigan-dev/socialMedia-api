import { BadRequestException } from '@nestjs/common';
import { SearchService } from './search.service';

describe('SearchService', () => {
  it('combines users, indexed posts, and hashtags with shared filters', async () => {
    const usersService = {
      findAll: jest.fn().mockResolvedValue({ items: [{ id: 'user-1' }] }),
    };
    const postsService = {
      search: jest.fn().mockResolvedValue([{ id: 'post-1' }]),
      searchHashtags: jest
        .fn()
        .mockResolvedValue([{ postCount: 2, tag: '#nestjs' }]),
    };
    const service = new SearchService(
      postsService as never,
      usersService as never,
    );

    await expect(
      service.search('viewer-1', {
        author: '@Ada',
        dateFrom: '2026-08-01',
        media: 'image',
        q: 'nest',
        type: 'all',
      }),
    ).resolves.toEqual({
      filters: {
        author: '@Ada',
        dateFrom: '2026-08-01',
        dateTo: '',
        media: 'image',
        type: 'all',
      },
      hashtags: [{ postCount: 2, tag: '#nestjs' }],
      posts: [{ id: 'post-1' }],
      query: 'nest',
      users: [{ id: 'user-1' }],
    });
    expect(postsService.search).toHaveBeenCalledWith('viewer-1', {
      author: '@Ada',
      dateFrom: '2026-08-01',
      dateTo: undefined,
      limit: undefined,
      media: 'image',
      query: 'nest',
    });
    expect(postsService.searchHashtags).toHaveBeenCalledWith(
      'viewer-1',
      expect.objectContaining({ media: 'image', query: 'nest' }),
    );
  });

  it('only queries the requested result type', async () => {
    const usersService = { findAll: jest.fn() };
    const postsService = {
      search: jest.fn().mockResolvedValue([]),
      searchHashtags: jest.fn(),
    };
    const service = new SearchService(
      postsService as never,
      usersService as never,
    );

    await service.search('viewer-1', {
      media: 'all',
      q: 'typescript',
      type: 'posts',
    });

    expect(postsService.search).toHaveBeenCalledTimes(1);
    expect(postsService.searchHashtags).not.toHaveBeenCalled();
    expect(usersService.findAll).not.toHaveBeenCalled();
  });

  it('uses one normalized search text for every result source', async () => {
    const usersService = {
      findAll: jest.fn().mockResolvedValue({ items: [] }),
    };
    const postsService = {
      search: jest.fn().mockResolvedValue([]),
      searchHashtags: jest.fn().mockResolvedValue([]),
    };
    const service = new SearchService(
      postsService as never,
      usersService as never,
    );

    await expect(
      service.search('viewer-1', {
        q: '  \uFF2E\uFF45\uFF53\uFF54\t  JS  ',
        type: 'all',
      }),
    ).resolves.toEqual(expect.objectContaining({ query: 'Nest JS' }));

    expect(usersService.findAll).toHaveBeenCalledWith(
      'viewer-1',
      expect.objectContaining({ query: 'Nest JS' }),
    );
    expect(postsService.search).toHaveBeenCalledWith(
      'viewer-1',
      expect.objectContaining({ query: 'Nest JS' }),
    );
    expect(postsService.searchHashtags).toHaveBeenCalledWith(
      'viewer-1',
      expect.objectContaining({ query: 'Nest JS' }),
    );
  });

  it('rejects whitespace-only text before querying any source', async () => {
    const usersService = { findAll: jest.fn() };
    const postsService = {
      search: jest.fn(),
      searchHashtags: jest.fn(),
    };
    const service = new SearchService(
      postsService as never,
      usersService as never,
    );

    await expect(
      service.search('viewer-1', { q: '   ', type: 'users' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(usersService.findAll).not.toHaveBeenCalled();
    expect(postsService.search).not.toHaveBeenCalled();
    expect(postsService.searchHashtags).not.toHaveBeenCalled();
  });
});
