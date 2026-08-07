import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

import { UserResponseMapper } from './user-response.mapper';
import { UsersService } from './users.service';

describe('UsersService relationships', () => {
  let service: UsersService;
  let userModel: {
    exists: jest.Mock;
    findOne: jest.Mock;
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
      findOne: jest.fn(),
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
      { get: jest.fn(() => 'http://localhost:3000') } as never,
    );

    relationshipService.assertRelationshipTarget.mockResolvedValue({
      currentObjectId: new Types.ObjectId(currentUserId),
      targetObjectId: new Types.ObjectId(targetUserId),
    });
    relationshipService.getHiddenUserIds.mockResolvedValue(new Set<string>());
  });

  it('follows a user and creates a follow notification', async () => {
    const currentObjectId = new Types.ObjectId(currentUserId);
    const targetObjectId = new Types.ObjectId(targetUserId);

    userModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
    userModel.findById
      .mockResolvedValueOnce({
        _id: targetObjectId,
        avatarUrl: '',
        followRequests: [],
        followers: [],
        following: [],
        profileVisibility: 'public',
        role: 'user',
        showOnlineStatus: true,
        status: 'available',
        username: 'Target User',
      })
      .mockResolvedValueOnce({
        _id: targetObjectId,
        avatarUrl: '',
        followRequests: [],
        followers: [currentObjectId],
        following: [],
        profileVisibility: 'public',
        role: 'user',
        showOnlineStatus: true,
        status: 'available',
        username: 'Target User',
      });

    await expect(
      service.setFollow(currentUserId, targetUserId, true),
    ).resolves.toEqual(
      expect.objectContaining({
        id: targetUserId,
        isFollowing: true,
        name: 'Target User',
      }),
    );

    expect(userModel.updateOne).toHaveBeenNthCalledWith(
      1,
      { _id: currentObjectId },
      { $addToSet: { following: targetObjectId } },
    );
    expect(userModel.updateOne).toHaveBeenNthCalledWith(
      2,
      { _id: targetObjectId },
      {
        $addToSet: { followers: currentObjectId },
        $pull: { followRequests: currentObjectId },
      },
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
    userModel.findById
      .mockResolvedValueOnce({
        _id: new Types.ObjectId(targetUserId),
        avatarUrl: '',
        followRequests: [],
        followers: [new Types.ObjectId(currentUserId)],
        following: [],
        profileVisibility: 'public',
        role: 'user',
        showOnlineStatus: true,
        status: 'available',
        username: 'Target User',
      })
      .mockResolvedValueOnce({
        _id: new Types.ObjectId(targetUserId),
        avatarUrl: '',
        followRequests: [],
        followers: [],
        following: [],
        profileVisibility: 'public',
        role: 'user',
        showOnlineStatus: true,
        status: 'available',
        username: 'Target User',
      });

    await expect(
      service.setFollow(currentUserId, targetUserId, false),
    ).resolves.toEqual(expect.objectContaining({ isFollowing: false }));

    expect(userModel.updateOne).toHaveBeenCalledTimes(2);
    expect(notificationsService.create).not.toHaveBeenCalled();
  });

  it('keeps repeated follow requests idempotent and avoids duplicate notifications', async () => {
    const currentObjectId = new Types.ObjectId(currentUserId);
    const targetObjectId = new Types.ObjectId(targetUserId);

    userModel.updateOne
      .mockResolvedValueOnce({ modifiedCount: 1 })
      .mockResolvedValueOnce({ modifiedCount: 1 })
      .mockResolvedValueOnce({ modifiedCount: 0 })
      .mockResolvedValueOnce({ modifiedCount: 0 });
    const targetUser = (followers: Types.ObjectId[]) => ({
      _id: targetObjectId,
      avatarUrl: '',
      followRequests: [],
      followers,
      following: [],
      profileVisibility: 'public',
      role: 'user',
      showOnlineStatus: true,
      status: 'available',
      username: 'Target User',
    });
    userModel.findById
      .mockResolvedValueOnce(targetUser([]))
      .mockResolvedValueOnce(targetUser([currentObjectId]))
      .mockResolvedValueOnce(targetUser([currentObjectId]))
      .mockResolvedValueOnce(targetUser([currentObjectId]));

    await service.setFollow(currentUserId, targetUserId, true);
    await service.setFollow(currentUserId, targetUserId, true);

    expect(userModel.updateOne).toHaveBeenCalledTimes(4);
    expect(notificationsService.create).toHaveBeenCalledTimes(1);
  });

  it('creates a request instead of directly following a private user', async () => {
    const currentObjectId = new Types.ObjectId(currentUserId);
    const targetObjectId = new Types.ObjectId(targetUserId);
    userModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
    userModel.findById
      .mockResolvedValueOnce({
        _id: targetObjectId,
        avatarUrl: '',
        followRequests: [],
        followers: [],
        following: [],
        profileVisibility: 'private',
        role: 'user',
        showOnlineStatus: true,
        status: 'available',
        username: 'Private User',
      })
      .mockResolvedValueOnce({
        _id: targetObjectId,
        avatarUrl: '',
        followRequests: [currentObjectId],
        followers: [],
        following: [],
        profileVisibility: 'private',
        role: 'user',
        showOnlineStatus: true,
        status: 'available',
        username: 'Private User',
      });

    await expect(
      service.setFollow(currentUserId, targetUserId, true),
    ).resolves.toEqual(
      expect.objectContaining({
        isFollowing: false,
        isFollowRequested: true,
        profileVisibility: 'private',
      }),
    );

    expect(userModel.updateOne).toHaveBeenCalledTimes(1);
    expect(userModel.updateOne).toHaveBeenCalledWith(
      { _id: targetObjectId, followers: { $ne: currentObjectId } },
      { $addToSet: { followRequests: currentObjectId } },
    );
    expect(notificationsService.create).toHaveBeenCalledWith({
      actorId: currentUserId,
      recipientId: targetUserId,
      type: 'follow_request',
    });
  });

  it('accepts a pending follow request and connects both users', async () => {
    const currentObjectId = new Types.ObjectId(currentUserId);
    const requesterObjectId = new Types.ObjectId(targetUserId);
    userModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
    userModel.findById.mockResolvedValue({
      _id: requesterObjectId,
      avatarUrl: '',
      followRequests: [],
      followers: [],
      following: [currentObjectId],
      profileVisibility: 'public',
      role: 'user',
      showOnlineStatus: true,
      status: 'available',
      username: 'Requester',
    });

    await expect(
      service.acceptFollowRequest(currentUserId, targetUserId),
    ).resolves.toEqual(expect.objectContaining({ id: targetUserId }));

    expect(userModel.updateOne).toHaveBeenNthCalledWith(
      1,
      { _id: currentObjectId, followRequests: requesterObjectId },
      {
        $addToSet: { followers: requesterObjectId },
        $pull: { followRequests: requesterObjectId },
      },
    );
    expect(userModel.updateOne).toHaveBeenNthCalledWith(
      2,
      { _id: requesterObjectId },
      { $addToSet: { following: currentObjectId } },
    );
    expect(notificationsService.create).toHaveBeenCalledWith({
      actorId: currentUserId,
      recipientId: targetUserId,
      type: 'follow_accept',
    });
  });

  it('declines a pending follow request without changing followers', async () => {
    userModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

    await expect(
      service.declineFollowRequest(currentUserId, targetUserId),
    ).resolves.toEqual({ id: targetUserId, ok: true });

    expect(userModel.updateOne).toHaveBeenCalledTimes(1);
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
          followRequests: new Types.ObjectId(targetUserId),
          followers: new Types.ObjectId(targetUserId),
          following: new Types.ObjectId(targetUserId),
        },
      },
    );
    expect(userModel.updateOne).toHaveBeenCalledWith(
      { _id: new Types.ObjectId(targetUserId) },
      {
        $pull: {
          followRequests: new Types.ObjectId(currentUserId),
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
      service.setFollow(currentUserId, currentUserId, true),
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
      service.setFollow(currentUserId, targetUserId, true),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.blockUser(currentUserId, targetUserId),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.muteUser(currentUserId, targetUserId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns a public profile only for a visible public user', async () => {
    userModel.findOne.mockResolvedValue({
      _id: new Types.ObjectId(targetUserId),
      avatarUrl: '',
      bio: 'Public bio',
      followers: [],
      following: [],
      isSuspended: false,
      profileVisibility: 'public',
      role: 'user',
      showOnlineStatus: true,
      status: 'available',
      username: 'Target User',
    });
    relationshipService.getHiddenUserIds.mockResolvedValue(new Set());

    await expect(
      service.getPublicProfileByUsername('Target User', currentUserId),
    ).resolves.toEqual(
      expect.objectContaining({
        id: targetUserId,
        name: 'Target User',
      }),
    );

    expect(userModel.findOne).toHaveBeenCalledWith({
      isSuspended: false,
      usernameLower: 'target user',
    });
  });

  it('returns private profile metadata while gating its content', async () => {
    userModel.findOne.mockResolvedValue({
      _id: new Types.ObjectId(targetUserId),
      avatarUrl: '',
      bio: 'Private bio',
      followRequests: [new Types.ObjectId(currentUserId)],
      followers: [],
      following: [],
      isSuspended: false,
      profileVisibility: 'private',
      role: 'user',
      showOnlineStatus: true,
      status: 'available',
      username: 'Private User',
    });
    relationshipService.getHiddenUserIds.mockResolvedValue(new Set());

    await expect(
      service.getPublicProfileByUsername('Private User', currentUserId),
    ).resolves.toEqual(
      expect.objectContaining({
        canViewContent: false,
        isFollowRequested: true,
        profileVisibility: 'private',
      }),
    );
  });

  it('hides a public profile when relationship visibility blocks it', async () => {
    userModel.findOne.mockResolvedValue({
      _id: new Types.ObjectId(targetUserId),
      username: 'Target User',
    });
    relationshipService.getHiddenUserIds.mockResolvedValue(
      new Set([targetUserId]),
    );

    await expect(
      service.getPublicProfileByUsername('Target User', currentUserId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
