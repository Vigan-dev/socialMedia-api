import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

import { PostsService } from './posts.service';

describe('PostsService discovery', () => {
  let aggregateExec: jest.Mock;
  let postFindQuery: {
    exec: jest.Mock;
    limit: jest.Mock;
    populate: jest.Mock;
    select: jest.Mock;
    sort: jest.Mock;
  };
  let postModel: {
    aggregate: jest.Mock;
    find: jest.Mock;
  };
  let relationshipService: { getViewerVisibility: jest.Mock };
  let service: PostsService;
  let userFindQuery: { exec: jest.Mock; select: jest.Mock };

  const viewerId = new Types.ObjectId();

  beforeEach(() => {
    postFindQuery = {
      exec: jest.fn().mockResolvedValue([]),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
    };
    aggregateExec = jest.fn().mockResolvedValue([]);
    postModel = {
      aggregate: jest.fn().mockReturnValue({ exec: aggregateExec }),
      find: jest.fn().mockReturnValue(postFindQuery),
    };
    userFindQuery = {
      exec: jest.fn().mockResolvedValue([]),
      select: jest.fn().mockReturnThis(),
    };
    relationshipService = {
      getViewerVisibility: jest.fn().mockResolvedValue({
        hiddenUserIds: new Set<string>(),
      }),
    };
    service = new PostsService(
      postModel as never,
      { find: jest.fn().mockReturnValue(userFindQuery) } as never,
      {} as never,
      relationshipService as never,
      { scorePost: jest.fn(), toFeedPost: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('uses the text index after applying post and author visibility filters', async () => {
    const hiddenAuthorId = new Types.ObjectId();
    const privateAuthorId = new Types.ObjectId();
    relationshipService.getViewerVisibility.mockResolvedValue({
      hiddenUserIds: new Set([hiddenAuthorId.toString()]),
    });
    userFindQuery.exec.mockResolvedValue([{ _id: privateAuthorId }]);

    await service.search(viewerId.toString(), { query: 'nest.*' });

    const findCalls = postModel.find.mock.calls as unknown[][];
    const filter = findCalls[0][0] as {
      $and: Array<Record<string, unknown>>;
    };
    expect(filter.$and[0]).toEqual({
      author: { $nin: [hiddenAuthorId, privateAuthorId] },
      hiddenBy: { $ne: viewerId },
      isArchived: { $ne: true },
      isHidden: { $ne: true },
    });
    expect(filter.$and[1]).toEqual({
      $text: { $caseSensitive: false, $search: '"nest"' },
    });
    expect(postFindQuery.select).toHaveBeenCalledWith({
      searchScore: { $meta: 'textScore' },
    });
  });

  it('matches normalized hashtags exactly when a topic is selected', async () => {
    await service.discover(viewerId.toString(), { tag: '#TypeScript' });

    expect(postModel.find).toHaveBeenCalledWith({
      $and: [
        {
          hiddenBy: { $ne: viewerId },
          isArchived: { $ne: true },
          isHidden: { $ne: true },
        },
        { hashtags: 'typescript' },
      ],
    });
  });

  it('rejects empty and overly broad search requests', async () => {
    await expect(
      service.search(viewerId.toString(), { query: 'x' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(postModel.find).not.toHaveBeenCalled();
  });

  it('builds trending topics only from discoverable recent posts', async () => {
    const hiddenAuthorId = new Types.ObjectId();
    relationshipService.getViewerVisibility.mockResolvedValue({
      hiddenUserIds: new Set([hiddenAuthorId.toString()]),
    });

    await service.findTrendingTopics(viewerId.toString(), '5');

    const aggregateCalls = postModel.aggregate.mock.calls as unknown[][];
    const pipeline = aggregateCalls[0][0] as Array<{
      $limit?: number;
      $match?: Record<string, unknown>;
    }>;
    expect(pipeline[0].$match).toEqual(
      expect.objectContaining({
        author: { $nin: [hiddenAuthorId] },
        hiddenBy: { $ne: viewerId },
        isArchived: { $ne: true },
        isHidden: { $ne: true },
      }),
    );
    expect(pipeline).toContainEqual({ $limit: 5 });
  });
});
