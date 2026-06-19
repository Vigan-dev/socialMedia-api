import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

import { UserResponseMapper } from './user-response.mapper';
import { UsersService } from './users.service';

describe('UsersService relationships', () => {
  let service: UsersService;
  let userModel: {
    exists: jest.Mock;
    findById: jest.Mock;
    updateOne: jest.Mock;
  };
  let notificationsService: {
    create: jest.Mock;
  };
  let relationshipService: {
    assertRelationshipTarget: jest.Mock;
    getHiddenUserIds: jest.Mock;
    getViewerVisibility: jest.Mock;
  };

  const currentUserId = new Types.ObjectId().toString();
  const targetUserId = new Types.ObjectId().toString();

  beforeEach(() => {
    userModel = {
      exists: jest.fn(),
      findById: jest.fn(),
      updateOne: jest.fn(),
    };
    notificationsService = {
      create: jest.fn(),
    };
    relationshipService = {
      assertRelationshipTarget: jest.fn(),
      getHiddenUserIds: jest.fn(),
      getViewerVisibility: jest.fn(),
    };

    service = new UsersService(
      userModel as never,
      notificationsService as never,
      relationshipService as never,
      new UserResponseMapper(),
    );

    relationshipService.assertRelationshipTarget.mockResolvedValue({
      currentObjectId: new Types.ObjectId(currentUserId),
      targetObjectId: new Types.ObjectId(targetUserId),
    });
  });

  it('follows a user and creates a follow notification', async () => {
    const currentObjectId = new Types.ObjectId(currentUserId);
    const targetObjectId = new Types.ObjectId(targetUserId);

    userModel.updateOne
      .mockResolvedValueOnce({ modifiedCount: 0 })
      .mockResolvedValue({ modifiedCount: 1 });
    userModel.findById.mockResolvedValue({
      _id: targetObjectId,
      avatarUrl: '',
      followers: [currentObjectId],
      following: [],
      role: 'user',
      showOnlineStatus: true,
      status: 'available',
      username: 'Target User',
    });

    await expect(
      service.toggleFollow(currentUserId, targetUserId),
    ).resolves.toEqual(
      expect.objectContaining({
        id: targetUserId,
        isFollowing: true,
        name: 'Target User',
      }),
    );

    expect(userModel.updateOne).toHaveBeenNthCalledWith(
      2,
      { _id: currentObjectId },
      { $addToSet: { following: targetObjectId } },
    );
    expect(userModel.updateOne).toHaveBeenNthCalledWith(
      3,
      { _id: targetObjectId },
      { $addToSet: { followers: currentObjectId } },
    );
    expect(notificationsService.create).toHaveBeenCalledWith({
      actorId: currentUserId,
      recipientId: targetUserId,
      type: 'follow',
    });
  });

  it('unfollows a user without creating a notification', async () => {
    userModel.updateOne
      .mockResolvedValueOnce({ modifiedCount: 1 })
      .mockResolvedValue({ modifiedCount: 1 });
    userModel.findById.mockResolvedValue({
      _id: new Types.ObjectId(targetUserId),
      avatarUrl: '',
      followers: [],
      following: [],
      role: 'user',
      showOnlineStatus: true,
      status: 'available',
      username: 'Target User',
    });

    await expect(
      service.toggleFollow(currentUserId, targetUserId),
    ).resolves.toEqual(expect.objectContaining({ isFollowing: false }));

    expect(userModel.updateOne).toHaveBeenCalledTimes(2);
    expect(notificationsService.create).not.toHaveBeenCalled();
  });

  it('blocks a user and removes both follow relationships', async () => {
    userModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

    await expect(
      service.blockUser(currentUserId, targetUserId),
    ).resolves.toEqual({ blocked: true, id: targetUserId });

    expect(userModel.updateOne).toHaveBeenCalledWith(
      { _id: new Types.ObjectId(currentUserId) },
      {
        $addToSet: { blockedUsers: new Types.ObjectId(targetUserId) },
        $pull: {
          followers: new Types.ObjectId(targetUserId),
          following: new Types.ObjectId(targetUserId),
        },
      },
    );
    expect(userModel.updateOne).toHaveBeenCalledWith(
      { _id: new Types.ObjectId(targetUserId) },
      {
        $pull: {
          followers: new Types.ObjectId(currentUserId),
          following: new Types.ObjectId(currentUserId),
        },
      },
    );
  });

  it('mutes a user after confirming the target exists', async () => {
    userModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

    await expect(
      service.muteUser(currentUserId, targetUserId),
    ).resolves.toEqual({ id: targetUserId, muted: true });

    expect(userModel.updateOne).toHaveBeenCalledWith(
      { _id: currentUserId },
      { $addToSet: { mutedUsers: new Types.ObjectId(targetUserId) } },
    );
  });

  it('rejects relationship actions against yourself', async () => {
    relationshipService.assertRelationshipTarget.mockRejectedValue(
      new BadRequestException('You cannot target yourself'),
    );

    await expect(
      service.toggleFollow(currentUserId, currentUserId),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.blockUser(currentUserId, currentUserId),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.muteUser(currentUserId, currentUserId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects relationship actions when the target user does not exist', async () => {
    relationshipService.assertRelationshipTarget.mockRejectedValue(
      new NotFoundException('User not found'),
    );

    await expect(
      service.toggleFollow(currentUserId, targetUserId),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.blockUser(currentUserId, targetUserId),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.muteUser(currentUserId, targetUserId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
