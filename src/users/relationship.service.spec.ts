import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

import { RelationshipService } from './relationship.service';

describe('RelationshipService', () => {
  let service: RelationshipService;
  let userModel: {
    exists: jest.Mock;
    find: jest.Mock;
    findById: jest.Mock;
  };

  function queryResult<T>(value: T) {
    return {
      exec: jest.fn().mockResolvedValue(value),
      select: jest.fn().mockReturnThis(),
    };
  }

  beforeEach(() => {
    userModel = {
      exists: jest.fn(),
      find: jest.fn(),
      findById: jest.fn(),
    };
    service = new RelationshipService(userModel as never);
  });

  it('builds hidden user ids from blocked, muted, and users blocking the viewer', async () => {
    const viewerId = new Types.ObjectId().toString();
    const blockedUserId = new Types.ObjectId();
    const mutedUserId = new Types.ObjectId();
    const blockingViewerId = new Types.ObjectId();
    const followingId = new Types.ObjectId();

    userModel.findById.mockReturnValue(
      queryResult({
        blockedUsers: [blockedUserId],
        following: [followingId],
        mutedUsers: [mutedUserId],
      }),
    );
    userModel.find.mockReturnValue(queryResult([{ _id: blockingViewerId }]));

    const visibility = await service.getViewerVisibility(viewerId);

    expect(visibility.followingIds).toEqual([followingId]);
    expect(visibility.hiddenUserIds).toEqual(
      new Set([
        blockedUserId.toString(),
        mutedUserId.toString(),
        blockingViewerId.toString(),
      ]),
    );
  });

  it('throws when a required viewer does not exist', async () => {
    userModel.findById.mockReturnValue(queryResult(null));
    userModel.find.mockReturnValue(queryResult([]));

    await expect(
      service.getViewerVisibility(new Types.ObjectId().toString(), {
        requireViewer: true,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('validates relationship targets in one place', async () => {
    const currentUserId = new Types.ObjectId().toString();
    const targetUserId = new Types.ObjectId().toString();
    userModel.exists.mockResolvedValue(true);

    await expect(
      service.assertRelationshipTarget(currentUserId, targetUserId),
    ).resolves.toEqual({
      currentObjectId: new Types.ObjectId(currentUserId),
      targetObjectId: new Types.ObjectId(targetUserId),
    });
  });

  it('rejects invalid and self relationship targets', async () => {
    const currentUserId = new Types.ObjectId().toString();

    expect(() => service.toObjectId('not-an-id')).toThrow(BadRequestException);
    await expect(
      service.assertRelationshipTarget(currentUserId, currentUserId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects missing relationship targets', async () => {
    userModel.exists.mockResolvedValue(false);

    await expect(
      service.assertRelationshipTarget(
        new Types.ObjectId().toString(),
        new Types.ObjectId().toString(),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
