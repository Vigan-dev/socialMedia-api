import { Types } from 'mongoose';

import { PostsService } from './posts.service';

describe('PostsService feed pagination', () => {
  let postModel: { find: jest.Mock };
  let postQuery: {
    exec: jest.Mock;
    limit: jest.Mock;
    populate: jest.Mock;
    sort: jest.Mock;
  };
  let relationshipService: { getViewerVisibility: jest.Mock };
  let service: PostsService;

  const authorId = new Types.ObjectId();
  const viewerId = new Types.ObjectId();

  function postDocument(id: Types.ObjectId, createdAt: Date) {
    return {
      toObject: jest.fn().mockReturnValue({
        _id: id,
        author: {
          _id: authorId,
          avatarUrl: '',
          email: 'author@example.com',
          followers: [],
          username: 'author',
        },
        comments: [],
        commentsCount: 0,
        content: 'Post',
        createdAt,
        likedBy: [],
        mediaUrls: [],
      }),
    };
  }

  beforeEach(() => {
    postQuery = {
      exec: jest.fn().mockResolvedValue([]),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
    };
    postModel = {
      find: jest.fn().mockReturnValue(postQuery),
    };
    relationshipService = {
      getViewerVisibility: jest.fn().mockResolvedValue({
        followingIds: [],
        hiddenUserIds: new Set<string>(),
      }),
    };

    service = new PostsService(
      postModel as never,
      {} as never,
      {} as never,
      relationshipService as never,
      {
        scorePost: jest.fn(),
        toFeedPost: jest.fn((post: { _id: Types.ObjectId }) => ({
          id: post._id.toString(),
        })),
      } as never,
      {} as never,
      {} as never,
    );
  });

  it('excludes hidden authors in MongoDB before applying the page limit', async () => {
    const hiddenAuthorId = new Types.ObjectId();
    relationshipService.getViewerVisibility.mockResolvedValue({
      followingIds: [],
      hiddenUserIds: new Set([hiddenAuthorId.toString()]),
    });

    await service.findAll(viewerId.toString(), { limit: '2' });

    expect(postModel.find).toHaveBeenCalledWith({
      author: { $nin: [hiddenAuthorId] },
      hiddenBy: { $ne: viewerId },
    });
    expect(postQuery.limit).toHaveBeenCalledWith(3);
  });

  it('combines following and hidden-author filters on the author field', async () => {
    const followedAuthorId = new Types.ObjectId();
    const hiddenAuthorId = new Types.ObjectId();
    relationshipService.getViewerVisibility.mockResolvedValue({
      followingIds: [followedAuthorId],
      hiddenUserIds: new Set([hiddenAuthorId.toString()]),
    });

    await service.findAll(viewerId.toString(), { feed: 'following' });

    expect(postModel.find).toHaveBeenCalledWith({
      author: {
        $in: [followedAuthorId],
        $nin: [hiddenAuthorId],
      },
      hiddenBy: { $ne: viewerId },
    });
  });

  it('uses createdAt and _id together when loading the next page', async () => {
    const createdAt = new Date('2026-07-31T10:00:00.000Z');
    const firstPostId = new Types.ObjectId('700000000000000000000002');
    const secondPostId = new Types.ObjectId('700000000000000000000001');
    postQuery.exec.mockResolvedValue([
      postDocument(firstPostId, createdAt),
      postDocument(secondPostId, createdAt),
    ]);

    const firstPage = await service.findAll(viewerId.toString(), {
      limit: '1',
    });

    expect(firstPage.nextCursor).not.toBeNull();

    await service.findAll(viewerId.toString(), {
      cursor: firstPage.nextCursor!,
      limit: '1',
    });

    expect(postModel.find).toHaveBeenLastCalledWith({
      $or: [
        { createdAt: { $lt: createdAt } },
        { _id: { $lt: firstPostId }, createdAt },
      ],
      hiddenBy: { $ne: viewerId },
    });
    expect(postQuery.sort).toHaveBeenLastCalledWith({
      _id: -1,
      createdAt: -1,
    });
  });
});
