import { Types } from 'mongoose';

import { UsersService } from './users.service';

describe('UsersService pagination and suggestions', () => {
  let aggregateExec: jest.Mock;
  let findExec: jest.Mock;
  let findQuery: {
    exec: jest.Mock;
    limit: jest.Mock;
    sort: jest.Mock;
  };
  let relationshipService: {
    getHiddenUserIds: jest.Mock;
    getViewerVisibility: jest.Mock;
  };
  let service: UsersService;
  let userModel: {
    aggregate: jest.Mock;
    find: jest.Mock;
  };

  beforeEach(() => {
    findExec = jest.fn().mockResolvedValue([]);
    findQuery = {
      exec: findExec,
      limit: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
    };
    aggregateExec = jest.fn().mockResolvedValue([]);
    userModel = {
      aggregate: jest.fn().mockReturnValue({ exec: aggregateExec }),
      find: jest.fn().mockReturnValue(findQuery),
    };
    relationshipService = {
      getHiddenUserIds: jest.fn().mockResolvedValue(new Set<string>()),
      getViewerVisibility: jest.fn(),
    };

    service = new UsersService(
      userModel as never,
      {} as never,
      relationshipService as never,
      {
        getUserId: jest.fn((user: { _id: Types.ObjectId }) =>
          user._id.toString(),
        ),
        toNetworkUser: jest.fn(),
      } as never,
      {} as never,
    );
  });

  it('excludes hidden users before applying a bounded user page', async () => {
    const viewerId = new Types.ObjectId();
    const hiddenUserId = new Types.ObjectId();
    relationshipService.getHiddenUserIds.mockResolvedValue(
      new Set([hiddenUserId.toString()]),
    );

    await service.findAll(viewerId.toString(), { limit: '10' });

    expect(userModel.find).toHaveBeenCalledWith({
      _id: { $nin: [viewerId, hiddenUserId] },
    });
    expect(findQuery.sort).toHaveBeenCalledWith({ usernameLower: 1, _id: 1 });
    expect(findQuery.limit).toHaveBeenCalledWith(11);
  });

  it('ranks and limits suggestions inside MongoDB', async () => {
    const viewerId = new Types.ObjectId();
    const followedUserId = new Types.ObjectId();
    const hiddenUserId = new Types.ObjectId();
    relationshipService.getViewerVisibility.mockResolvedValue({
      blockedUserIds: [],
      followingIds: [followedUserId],
      hiddenUserIds: new Set([hiddenUserId.toString()]),
      mutedUserIds: [],
    });

    await service.findSuggestedUsers(viewerId.toString());

    expect(userModel.aggregate).toHaveBeenCalledWith([
      {
        $match: {
          _id: { $nin: [viewerId, followedUserId, hiddenUserId] },
        },
      },
      {
        $addFields: {
          suggestionFollowerCount: {
            $size: { $ifNull: ['$followers', []] },
          },
        },
      },
      { $sort: { suggestionFollowerCount: -1, usernameLower: 1, _id: 1 } },
      { $limit: 5 },
      { $project: { suggestionFollowerCount: 0 } },
    ]);
    expect(userModel.find).not.toHaveBeenCalled();
  });
});
