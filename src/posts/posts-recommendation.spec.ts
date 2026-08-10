import { Types } from 'mongoose';
import { PostsService } from './posts.service';

describe('PostsService recommendation feed', () => {
  it('applies visibility filters before loading the bounded candidate set', async () => {
    const viewerId = new Types.ObjectId();
    const hiddenAuthorId = new Types.ObjectId();
    const privateAuthorId = new Types.ObjectId();
    const signalQuery = {
      exec: jest.fn().mockResolvedValue([]),
      limit: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
    };
    const candidateQuery = {
      exec: jest.fn().mockResolvedValue([]),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
    };
    const postModel = {
      find: jest
        .fn()
        .mockReturnValueOnce(signalQuery)
        .mockReturnValueOnce(candidateQuery),
    };
    const inaccessibleUserQuery = {
      exec: jest.fn().mockResolvedValue([{ _id: privateAuthorId }]),
      select: jest.fn().mockReturnThis(),
    };
    const relationshipService = {
      getViewerVisibility: jest.fn().mockResolvedValue({
        followingIds: [],
        hiddenUserIds: new Set([hiddenAuthorId.toString()]),
      }),
    };
    const service = new PostsService(
      postModel as never,
      { find: jest.fn().mockReturnValue(inaccessibleUserQuery) } as never,
      {} as never,
      relationshipService as never,
      { toFeedPost: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.findAll(viewerId.toString(), {
        feed: 'recommended',
        limit: '12',
      }),
    ).resolves.toEqual({ hasMore: false, items: [], nextCursor: null });

    const findCalls = postModel.find.mock.calls as unknown[][];
    expect(findCalls[1][0]).toEqual({
      $and: [
        {
          author: { $nin: [hiddenAuthorId, privateAuthorId] },
          hiddenBy: { $ne: viewerId },
          isArchived: { $ne: true },
          isHidden: { $ne: true },
        },
        { author: { $ne: viewerId } },
      ],
    });
    expect(candidateQuery.limit).toHaveBeenCalledWith(120);
  });
});
