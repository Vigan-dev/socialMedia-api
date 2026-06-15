import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { User } from './schemas/user.schema';
import type { UserDocument } from './schemas/user.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { RelationshipService } from './relationship.service';
import type {
  NetworkUserResponse,
  UserProfileResponse,
} from './dto/user-response.dto';
import { UserResponseMapper } from './user-response.mapper';
import type { MessagePrivacy, UserStatus } from './user.constants';

const MAX_AVATAR_DATA_URL_LENGTH = 2_000_000;

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly relationshipService: RelationshipService,
    private readonly userResponseMapper: UserResponseMapper,
  ) {}

  async findByEmail(email: string) {
    return this.userModel.findOne({ email }).select('+password');
  }

  async findByEmailWithPasswordReset(email: string) {
    return this.userModel
      .findOne({ email })
      .select('+passwordResetTokenHash +passwordResetExpiresAt');
  }

  async findById(id: string) {
    return this.userModel.findById(id);
  }

  async findByIdWithRefreshToken(id: string) {
    return this.userModel.findById(id).select('+refreshTokenHash');
  }

  async updateRefreshTokenHash(userId: string, refreshTokenHash: string) {
    await this.userModel.updateOne({ _id: userId }, { refreshTokenHash });
  }

  async clearRefreshTokenHash(userId: string) {
    await this.userModel.updateOne(
      { _id: userId },
      { $unset: { refreshTokenHash: '' } },
    );
  }

  async updatePasswordResetToken(
    userId: string,
    passwordResetTokenHash: string,
    passwordResetExpiresAt: Date,
  ) {
    await this.userModel.updateOne(
      { _id: userId },
      { passwordResetTokenHash, passwordResetExpiresAt },
    );
  }

  async updatePassword(userId: string, password: string) {
    await this.userModel.updateOne(
      { _id: userId },
      {
        password,
        $unset: {
          passwordResetExpiresAt: '',
          passwordResetTokenHash: '',
          refreshTokenHash: '',
        },
      },
    );
  }

  async updatePasswordWithResetToken(
    userId: string,
    password: string,
    passwordResetTokenHash: string,
  ) {
    const result = await this.userModel.updateOne(
      {
        _id: userId,
        passwordResetTokenHash,
        passwordResetExpiresAt: { $gt: new Date() },
      },
      {
        password,
        $unset: {
          passwordResetExpiresAt: '',
          passwordResetTokenHash: '',
          refreshTokenHash: '',
        },
      },
    );

    return result.modifiedCount > 0;
  }

  async create(userData: Partial<User>): Promise<UserProfileResponse> {
    const user = await this.userModel.create(userData);

    return this.userResponseMapper.toProfile(user);
  }

  async upsertAdminUser(userData: {
    email: string;
    password: string;
    username: string;
  }) {
    const existingUser = await this.userModel.findOne({
      $or: [{ email: userData.email }, { username: userData.username }],
    });

    if (existingUser) {
      existingUser.email = userData.email;
      existingUser.isSuspended = false;
      existingUser.password = userData.password;
      existingUser.role = 'admin';
      existingUser.suspensionReason = '';
      existingUser.username = userData.username;
      await existingUser.save();
      return;
    }

    await this.userModel.create({
      email: userData.email,
      isSuspended: false,
      password: userData.password,
      role: 'admin',
      suspensionReason: '',
      username: userData.username,
    });
  }

  async setAdminPasswordByEmail(userData: { email: string; password: string }) {
    await this.userModel.updateOne(
      { email: userData.email },
      {
        $set: {
          email: userData.email,
          isSuspended: false,
          password: userData.password,
          role: 'admin',
          suspensionReason: '',
        },
      },
      { runValidators: true },
    );
  }

  async findAll(currentUserId?: string): Promise<NetworkUserResponse[]> {
    const users = await this.userModel.find().sort({ username: 1 }).exec();
    const hiddenUserIds = currentUserId
      ? await this.relationshipService.getHiddenUserIds(currentUserId)
      : new Set<string>();

    return users
      .filter(
        (user) =>
          this.getUserId(user) !== currentUserId &&
          !hiddenUserIds.has(this.getUserId(user)),
      )
      .map((user) => this.userResponseMapper.toNetworkUser(user, currentUserId));
  }

  async findFollowers(userId: string): Promise<NetworkUserResponse[]> {
    const user = await this.userModel.findById(userId).select('followers');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const followers = await this.userModel
      .find({ _id: { $in: user.followers ?? [] } })
      .sort({ username: 1 })
      .exec();

    const hiddenUserIds =
      await this.relationshipService.getHiddenUserIds(userId);

    return followers
      .filter((follower) => !hiddenUserIds.has(this.getUserId(follower)))
      .map((follower) => this.userResponseMapper.toNetworkUser(follower, userId));
  }

  async findFollowing(userId: string): Promise<NetworkUserResponse[]> {
    const user = await this.userModel.findById(userId).select('following');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const following = await this.userModel
      .find({ _id: { $in: user.following ?? [] } })
      .sort({ username: 1 })
      .exec();

    const hiddenUserIds =
      await this.relationshipService.getHiddenUserIds(userId);

    return following
      .filter(
        (followedUser) => !hiddenUserIds.has(this.getUserId(followedUser)),
      )
      .map((followedUser) =>
        this.userResponseMapper.toNetworkUser(followedUser, userId),
      );
  }

  async findSuggestedUsers(userId: string): Promise<NetworkUserResponse[]> {
    const visibility = await this.relationshipService.getViewerVisibility(
      userId,
      { requireViewer: true },
    );
    const excludedIds = [
      new Types.ObjectId(userId),
      ...visibility.followingIds,
      ...visibility.blockedUserIds,
      ...visibility.mutedUserIds,
    ];
    const candidates = await this.userModel
      .find({ _id: { $nin: excludedIds } })
      .sort({ username: 1 })
      .exec();

    return candidates
      .sort(
        (a, b) =>
          (b.followers ?? []).length - (a.followers ?? []).length ||
          a.username.localeCompare(b.username),
      )
      .filter(
        (suggestion) =>
          !visibility.hiddenUserIds.has(this.getUserId(suggestion)),
      )
      .slice(0, 5)
      .map((suggestion) =>
        this.userResponseMapper.toNetworkUser(suggestion, userId),
      );
  }

  async getProfile(userId: string): Promise<UserProfileResponse> {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.userResponseMapper.toProfile(user);
  }

  async updateProfile(
    userId: string,
    data: { avatarUrl?: string | null; bio?: string; username?: string },
  ): Promise<UserProfileResponse> {
    const bio = data.bio?.trim();
    const username = data.username?.trim();
    const avatarUrl = data.avatarUrl?.trim() ?? '';
    const update: Partial<User> = {};

    if (username) {
      update.username = username;
    }

    if (data.bio !== undefined) {
      update.bio = bio ?? '';
    }

    if (data.avatarUrl !== undefined) {
      this.assertValidAvatarUrl(avatarUrl);
      update.avatarUrl = avatarUrl;
    }

    const user = await this.userModel.findByIdAndUpdate(userId, update, {
      returnDocument: 'after',
      runValidators: true,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.userResponseMapper.toProfile(user);
  }

  async checkUsernameAvailability(userId: string, username: string) {
    const trimmedUsername = username?.trim();

    if (!trimmedUsername) {
      return { available: false };
    }

    const existingUser = await this.userModel
      .findOne({
        _id: { $ne: new Types.ObjectId(userId) },
        username: new RegExp(`^${this.escapeRegex(trimmedUsername)}$`, 'i'),
      })
      .select('_id');

    return { available: !existingUser };
  }

  async updateStatus(
    userId: string,
    status: UserStatus,
  ): Promise<UserProfileResponse> {
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { status },
      { returnDocument: 'after', runValidators: true },
    );

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.userResponseMapper.toProfile(user);
  }

  async updatePrivacy(
    userId: string,
    data: {
      allowMessagesFrom?: MessagePrivacy;
      allowMentionsFrom?: MessagePrivacy;
      showOnlineStatus?: boolean;
    },
  ): Promise<UserProfileResponse> {
    const update: Record<string, unknown> = {};

    if (data.allowMessagesFrom !== undefined) {
      update['privacy.allowMessagesFrom'] = data.allowMessagesFrom;
    }

    if (data.allowMentionsFrom !== undefined) {
      update['privacy.allowMentionsFrom'] = data.allowMentionsFrom;
    }

    if (data.showOnlineStatus !== undefined) {
      update.showOnlineStatus = Boolean(data.showOnlineStatus);
    }

    const user = await this.userModel.findByIdAndUpdate(userId, update, {
      returnDocument: 'after',
      runValidators: true,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.userResponseMapper.toProfile(user);
  }

  async updateNotificationSettings(
    userId: string,
    data: {
      comments?: boolean;
      follows?: boolean;
      likes?: boolean;
      mentions?: boolean;
      messages?: boolean;
    },
  ): Promise<UserProfileResponse> {
    const update = Object.entries(data).reduce<Record<string, boolean>>(
      (settings, [key, value]) => {
        if (value !== undefined) {
          settings[`notificationSettings.${key}`] = Boolean(value);
        }

        return settings;
      },
      {},
    );

    const user = await this.userModel.findByIdAndUpdate(userId, update, {
      returnDocument: 'after',
      runValidators: true,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.userResponseMapper.toProfile(user);
  }

  async updateAvatar(
    userId: string,
    avatarUrl?: string | null,
  ): Promise<UserProfileResponse> {
    const nextAvatarUrl = avatarUrl?.trim() ?? '';

    this.assertValidAvatarUrl(nextAvatarUrl);

    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { avatarUrl: nextAvatarUrl },
      {
        returnDocument: 'after',
        runValidators: true,
      },
    );

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.userResponseMapper.toProfile(user);
  }

  async toggleFollow(
    currentUserId: string,
    targetUserId: string,
  ): Promise<NetworkUserResponse> {
    const { currentObjectId, targetObjectId } =
      await this.relationshipService.assertRelationshipTarget(
        currentUserId,
        targetUserId,
        'You cannot follow yourself',
        { requireCurrentUser: true },
      );

    const unfollowResult = await this.userModel.updateOne(
      { _id: currentObjectId, following: targetObjectId },
      { $pull: { following: targetObjectId } },
    );

    const didUnfollow = unfollowResult.modifiedCount > 0;

    if (didUnfollow) {
      await this.userModel.updateOne(
        { _id: targetObjectId },
        { $pull: { followers: currentObjectId } },
      );
    }

    if (!didUnfollow) {
      await Promise.all([
        this.userModel.updateOne(
          { _id: currentObjectId },
          { $addToSet: { following: targetObjectId } },
        ),
        this.userModel.updateOne(
          { _id: targetObjectId },
          { $addToSet: { followers: currentObjectId } },
        ),
      ]);
      await this.notificationsService.create({
        actorId: currentUserId,
        recipientId: targetUserId,
        type: 'follow',
      });
    }

    const targetUser = await this.userModel.findById(targetUserId);

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    return this.userResponseMapper.toNetworkUser(targetUser, currentUserId);
  }

  async blockUser(currentUserId: string, targetUserId: string) {
    const { currentObjectId, targetObjectId } =
      await this.relationshipService.assertRelationshipTarget(
        currentUserId,
        targetUserId,
      );

    await Promise.all([
      this.userModel.updateOne(
        { _id: currentObjectId },
        {
          $addToSet: { blockedUsers: targetObjectId },
          $pull: { following: targetObjectId, followers: targetObjectId },
        },
      ),
      this.userModel.updateOne(
        { _id: targetObjectId },
        { $pull: { following: currentObjectId, followers: currentObjectId } },
      ),
    ]);

    return { id: targetUserId, blocked: true };
  }

  async unblockUser(currentUserId: string, targetUserId: string) {
    this.relationshipService.assertNotSelf(
      currentUserId,
      targetUserId,
      'You cannot target yourself',
    );
    const targetObjectId = this.relationshipService.toObjectId(targetUserId);

    await this.userModel.updateOne(
      { _id: currentUserId },
      { $pull: { blockedUsers: targetObjectId } },
    );

    return { id: targetUserId, blocked: false };
  }

  async muteUser(currentUserId: string, targetUserId: string) {
    const { targetObjectId } =
      await this.relationshipService.assertRelationshipTarget(
        currentUserId,
        targetUserId,
      );

    await this.userModel.updateOne(
      { _id: currentUserId },
      { $addToSet: { mutedUsers: targetObjectId } },
    );

    return { id: targetUserId, muted: true };
  }

  async unmuteUser(currentUserId: string, targetUserId: string) {
    this.relationshipService.assertNotSelf(
      currentUserId,
      targetUserId,
      'You cannot target yourself',
    );
    const targetObjectId = this.relationshipService.toObjectId(targetUserId);

    await this.userModel.updateOne(
      { _id: currentUserId },
      { $pull: { mutedUsers: targetObjectId } },
    );

    return { id: targetUserId, muted: false };
  }

  private getUserId(user: UserDocument) {
    return this.userResponseMapper.getUserId(user);
  }

  private assertValidAvatarUrl(avatarUrl: string) {
    if (
      avatarUrl &&
      !avatarUrl.startsWith('data:image/') &&
      !avatarUrl.startsWith('http://') &&
      !avatarUrl.startsWith('https://')
    ) {
      throw new BadRequestException('Avatar must be an image data URL or URL');
    }

    if (avatarUrl.length > MAX_AVATAR_DATA_URL_LENGTH) {
      throw new BadRequestException('Avatar image is too large');
    }
  }

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
