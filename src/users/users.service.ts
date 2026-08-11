import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { QueryFilter } from 'mongoose';

import { User } from './schemas/user.schema';
import type { UserDocument } from './schemas/user.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { RelationshipService } from './relationship.service';
import type {
  NetworkUserResponse,
  PublicUserProfileResponse,
  UserProfileResponse,
} from './dto/user-response.dto';
import { UserResponseMapper } from './user-response.mapper';
import type {
  MessagePrivacy,
  ProfileVisibility,
  UserStatus,
} from './user.constants';
import { isTrustedUploadUrl } from '../uploads/upload-url.validation';
import {
  getDuplicateIdentityField,
  normalizeEmail,
  normalizeUsername,
  normalizeUsernameLower,
} from './user-identity';
import {
  buildCursorPage,
  decodeCursor,
  encodeCursor,
  parsePageLimit,
} from '../common/pagination/cursor-pagination';

const MAX_AVATAR_URL_LENGTH = 2048;

type UserPageQuery = {
  cursor?: string;
  limit?: string;
  query?: string;
};

function escapeRegularExpression(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeUserSearchQuery(value?: string) {
  return value?.trim().replace(/^@+/, '').toLocaleLowerCase('en-US') ?? '';
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly relationshipService: RelationshipService,
    private readonly userResponseMapper: UserResponseMapper,
    private readonly configService: ConfigService,
  ) {}

  async findByEmail(email: string) {
    return this.userModel
      .findOne({ emailLower: normalizeEmail(email) })
      .select(
        '+password +failedLoginAttempts +failedLoginWindowStartedAt +loginLockedUntil +securityVersion +twoFactorSecretEncrypted +twoFactorRecoveryCodeHashes',
      );
  }

  async findByEmailWithVerification(email: string) {
    return this.userModel
      .findOne({ emailLower: normalizeEmail(email) })
      .select('+emailVerificationTokenHash +emailVerificationExpiresAt');
  }

  async findByEmailWithPasswordReset(email: string) {
    return this.userModel
      .findOne({ emailLower: normalizeEmail(email) })
      .select('+passwordResetTokenHash +passwordResetExpiresAt');
  }

  async findById(id: string) {
    return this.userModel.findById(id);
  }

  async findByIdWithRefreshToken(id: string) {
    return this.userModel
      .findById(id)
      .select('+refreshTokenHash +securityVersion');
  }

  async findByIdWithPasswordAndSecurity(id: string) {
    return this.userModel.findById(id).select('+password +securityVersion');
  }

  async findByIdForTwoFactor(id: string) {
    return this.userModel
      .findById(id)
      .select(
        '+password +securityVersion +twoFactorSecretEncrypted +twoFactorPendingSecretEncrypted +twoFactorRecoveryCodeHashes',
      );
  }

  async findByIdForAccess(id: string) {
    return this.userModel.findById(id).select('+securityVersion');
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

  async recordFailedLogin(userId: string, now = new Date()) {
    const windowCutoff = new Date(now.getTime() - 15 * 60_000);
    const lockedUntil = new Date(now.getTime() + 15 * 60_000);
    const withinWindow = {
      $gte: [
        { $ifNull: ['$failedLoginWindowStartedAt', new Date(0)] },
        windowCutoff,
      ],
    };
    const nextAttemptCount = {
      $cond: [
        withinWindow,
        { $add: [{ $ifNull: ['$failedLoginAttempts', 0] }, 1] },
        1,
      ],
    };

    await this.userModel.updateOne({ _id: userId }, [
      {
        $set: {
          failedLoginAttempts: nextAttemptCount,
          failedLoginWindowStartedAt: {
            $cond: [withinWindow, '$failedLoginWindowStartedAt', now],
          },
        },
      },
      {
        $set: {
          failedLoginAttempts: {
            $cond: [
              { $gte: ['$failedLoginAttempts', 5] },
              0,
              '$failedLoginAttempts',
            ],
          },
          failedLoginWindowStartedAt: {
            $cond: [
              { $gte: ['$failedLoginAttempts', 5] },
              '$$REMOVE',
              '$failedLoginWindowStartedAt',
            ],
          },
          loginLockedUntil: {
            $cond: [
              { $gte: ['$failedLoginAttempts', 5] },
              lockedUntil,
              '$loginLockedUntil',
            ],
          },
        },
      },
    ]);
  }

  async clearFailedLoginState(userId: string) {
    await this.userModel.updateOne(
      { _id: userId },
      {
        $unset: {
          failedLoginAttempts: '',
          failedLoginWindowStartedAt: '',
          loginLockedUntil: '',
        },
      },
    );
  }

  async invalidateSessions(userId: string) {
    await this.userModel.updateOne(
      { _id: userId },
      {
        $inc: { securityVersion: 1 },
        $unset: { refreshTokenHash: '' },
      },
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

  async updateEmailVerificationToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ) {
    await this.userModel.updateOne(
      { _id: userId, isEmailVerified: { $ne: true } },
      {
        $set: {
          emailVerificationExpiresAt: expiresAt,
          emailVerificationTokenHash: tokenHash,
        },
      },
    );
  }

  async verifyEmail(userId: string, tokenHash: string) {
    const result = await this.userModel.updateOne(
      {
        _id: userId,
        emailVerificationExpiresAt: { $gt: new Date() },
        emailVerificationTokenHash: tokenHash,
      },
      {
        $set: { isEmailVerified: true },
        $unset: {
          emailVerificationExpiresAt: '',
          emailVerificationTokenHash: '',
        },
      },
    );

    return result.modifiedCount > 0;
  }

  async storePendingTwoFactorSecret(userId: string, encryptedSecret: string) {
    await this.userModel.updateOne(
      { _id: userId, twoFactorEnabled: { $ne: true } },
      { $set: { twoFactorPendingSecretEncrypted: encryptedSecret } },
    );
  }

  async enableTwoFactor(
    userId: string,
    encryptedSecret: string,
    recoveryCodeHashes: string[],
  ) {
    await this.userModel.updateOne(
      { _id: userId, twoFactorEnabled: { $ne: true } },
      {
        $set: {
          twoFactorEnabled: true,
          twoFactorRecoveryCodeHashes: recoveryCodeHashes,
          twoFactorSecretEncrypted: encryptedSecret,
        },
        $unset: { twoFactorPendingSecretEncrypted: '' },
      },
    );
  }

  async removeTwoFactorRecoveryCode(userId: string, recoveryCodeHash: string) {
    const result = await this.userModel.updateOne(
      { _id: userId, twoFactorRecoveryCodeHashes: recoveryCodeHash },
      { $pull: { twoFactorRecoveryCodeHashes: recoveryCodeHash } },
    );

    return result.modifiedCount > 0;
  }

  async disableTwoFactorAndInvalidateSessions(userId: string) {
    await this.userModel.updateOne(
      { _id: userId },
      {
        $inc: { securityVersion: 1 },
        $set: { twoFactorEnabled: false },
        $unset: {
          refreshTokenHash: '',
          twoFactorPendingSecretEncrypted: '',
          twoFactorRecoveryCodeHashes: '',
          twoFactorSecretEncrypted: '',
        },
      },
    );
  }

  async updatePasswordAndInvalidateSessions(userId: string, password: string) {
    await this.userModel.updateOne(
      { _id: userId },
      {
        $inc: { securityVersion: 1 },
        $set: { password },
        $unset: {
          failedLoginAttempts: '',
          failedLoginWindowStartedAt: '',
          loginLockedUntil: '',
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
        $inc: { securityVersion: 1 },
        $set: { password },
        $unset: {
          failedLoginAttempts: '',
          failedLoginWindowStartedAt: '',
          loginLockedUntil: '',
          passwordResetExpiresAt: '',
          passwordResetTokenHash: '',
          refreshTokenHash: '',
        },
      },
    );

    return result.modifiedCount > 0;
  }

  async create(userData: Partial<User>): Promise<UserProfileResponse> {
    let user: UserDocument;

    try {
      user = await this.userModel.create(this.withCanonicalIdentity(userData));
    } catch (error) {
      this.throwIdentityConflict(error);
    }

    return this.userResponseMapper.toProfile(user);
  }

  async deleteUnverifiedRegistration(userId: string): Promise<void> {
    const result = await this.userModel.deleteOne({
      _id: userId,
      isEmailVerified: false,
    });

    if (result.deletedCount !== 1) {
      throw new Error('Unverified registration could not be deleted');
    }
  }

  async upsertAdminUser(userData: {
    email: string;
    password: string;
    username: string;
  }) {
    const email = normalizeEmail(userData.email);
    const username = normalizeUsername(userData.username);
    const usernameLower = normalizeUsernameLower(username);

    try {
      const existingUser = await this.userModel.findOne({
        $or: [{ emailLower: email }, { usernameLower }],
      });

      if (existingUser) {
        existingUser.email = email;
        existingUser.emailLower = email;
        existingUser.isSuspended = false;
        existingUser.password = userData.password;
        existingUser.role = 'admin';
        existingUser.suspensionReason = '';
        existingUser.username = username;
        existingUser.usernameLower = usernameLower;
        await existingUser.save();
        return;
      }

      await this.userModel.create({
        email,
        emailLower: email,
        isSuspended: false,
        password: userData.password,
        role: 'admin',
        suspensionReason: '',
        username,
        usernameLower,
      });
    } catch (error) {
      this.throwIdentityConflict(error);
    }
  }

  async setAdminPasswordByEmail(userData: { email: string; password: string }) {
    const email = normalizeEmail(userData.email);

    try {
      await this.userModel.updateOne(
        { emailLower: email },
        {
          $set: {
            email,
            emailLower: email,
            isSuspended: false,
            password: userData.password,
            role: 'admin',
            suspensionReason: '',
          },
        },
        { runValidators: true },
      );
    } catch (error) {
      this.throwIdentityConflict(error);
    }
  }

  async findAll(currentUserId?: string, query: UserPageQuery = {}) {
    const hiddenUserIds = currentUserId
      ? await this.relationshipService.getHiddenUserIds(currentUserId)
      : new Set<string>();
    const excludedIds = [
      ...(currentUserId ? [new Types.ObjectId(currentUserId)] : []),
      ...this.toObjectIds(hiddenUserIds),
    ];

    const searchQuery = normalizeUserSearchQuery(query.query);

    if (searchQuery.length > 50) {
      throw new BadRequestException(
        'User search query must be 50 characters or less',
      );
    }

    const filter: QueryFilter<UserDocument> = {
      isSuspended: false,
      ...(excludedIds.length ? { _id: { $nin: excludedIds } } : {}),
      ...(searchQuery
        ? {
            usernameLower: {
              $regex: `^${escapeRegularExpression(searchQuery)}`,
            },
          }
        : {}),
    };

    return this.findNetworkUserPage({
      currentUserId,
      filter,
      query,
      scope: searchQuery ? `users-search:${searchQuery}` : 'users',
    });
  }

  async findFollowers(userId: string, query: UserPageQuery = {}) {
    const user = await this.userModel.findById(userId).select('followers');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const hiddenUserIds =
      await this.relationshipService.getHiddenUserIds(userId);

    return this.findNetworkUserPage({
      currentUserId: userId,
      filter: {
        _id: {
          $in: user.followers ?? [],
          $nin: this.toObjectIds(hiddenUserIds),
        },
      },
      query,
      scope: 'user-followers',
    });
  }

  async findFollowing(userId: string, query: UserPageQuery = {}) {
    const user = await this.userModel.findById(userId).select('following');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const hiddenUserIds =
      await this.relationshipService.getHiddenUserIds(userId);

    return this.findNetworkUserPage({
      currentUserId: userId,
      filter: {
        _id: {
          $in: user.following ?? [],
          $nin: this.toObjectIds(hiddenUserIds),
        },
      },
      query,
      scope: 'user-following',
    });
  }

  async findFollowRequests(userId: string, query: UserPageQuery = {}) {
    const user = await this.userModel.findById(userId).select('followRequests');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const hiddenUserIds =
      await this.relationshipService.getHiddenUserIds(userId);

    return this.findNetworkUserPage({
      currentUserId: userId,
      filter: {
        _id: {
          $in: user.followRequests ?? [],
          $nin: this.toObjectIds(hiddenUserIds),
        },
      },
      query,
      scope: 'user-follow-requests',
    });
  }

  async findSuggestedUsers(userId: string): Promise<NetworkUserResponse[]> {
    const viewerObjectId = new Types.ObjectId(userId);
    const visibility = await this.relationshipService.getViewerVisibility(
      userId,
      { requireViewer: true },
    );
    const excludedIds = [
      viewerObjectId,
      ...visibility.followingIds,
      ...this.toObjectIds(visibility.hiddenUserIds),
    ];
    const candidates = await this.userModel
      .aggregate<UserDocument>([
        {
          $match: {
            _id: { $nin: excludedIds },
            followRequests: { $ne: viewerObjectId },
            isSuspended: false,
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
      ])
      .exec();

    return candidates.map((suggestion) =>
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

  async getPublicProfileByUsername(
    username: string,
    viewerId?: string,
  ): Promise<PublicUserProfileResponse> {
    const hiddenUserIds = viewerId
      ? await this.relationshipService.getHiddenUserIds(viewerId)
      : new Set<string>();
    const user = await this.userModel.findOne({
      isSuspended: false,
      usernameLower: normalizeUsernameLower(username),
    });

    if (!user || hiddenUserIds.has(this.getUserId(user))) {
      throw new NotFoundException('User not found');
    }

    return this.userResponseMapper.toPublicProfile(user, viewerId);
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
      update.usernameLower = normalizeUsernameLower(username);
    }

    if (data.bio !== undefined) {
      update.bio = bio ?? '';
    }

    if (data.avatarUrl !== undefined) {
      this.assertValidAvatarUrl(avatarUrl);
      update.avatarUrl = avatarUrl;
    }

    let user: UserDocument | null;

    try {
      user = await this.userModel.findByIdAndUpdate(userId, update, {
        returnDocument: 'after',
        runValidators: true,
      });
    } catch (error) {
      this.throwIdentityConflict(error);
    }

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
        usernameLower: normalizeUsernameLower(trimmedUsername),
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
      profileVisibility?: ProfileVisibility;
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

    if (data.profileVisibility !== undefined) {
      update.profileVisibility = data.profileVisibility;
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

  async setFollow(
    currentUserId: string,
    targetUserId: string,
    shouldFollow: boolean,
  ): Promise<NetworkUserResponse> {
    const { currentObjectId, targetObjectId } =
      await this.relationshipService.assertRelationshipTarget(
        currentUserId,
        targetUserId,
        'You cannot follow yourself',
        { requireCurrentUser: true },
      );

    const hiddenUserIds =
      await this.relationshipService.getHiddenUserIds(currentUserId);

    if (hiddenUserIds.has(targetUserId)) {
      throw new NotFoundException('User not found');
    }

    const targetUser = await this.userModel.findById(targetObjectId);

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    const isAlreadyFollowing = (targetUser.followers ?? []).some(
      (followerId) => followerId.toString() === currentUserId,
    );

    if (
      shouldFollow &&
      targetUser.profileVisibility === 'private' &&
      !isAlreadyFollowing
    ) {
      const requestUpdate = await this.userModel.updateOne(
        { _id: targetObjectId, followers: { $ne: currentObjectId } },
        { $addToSet: { followRequests: currentObjectId } },
      );

      if (requestUpdate.modifiedCount > 0) {
        await this.notificationsService.create({
          actorId: currentUserId,
          recipientId: targetUserId,
          type: 'follow_request',
        });
      }

      const requestedUser = await this.userModel.findById(targetObjectId);

      if (!requestedUser) {
        throw new NotFoundException('User not found');
      }

      return this.userResponseMapper.toNetworkUser(
        requestedUser,
        currentUserId,
      );
    }

    const [currentUserUpdate] = await Promise.all([
      this.userModel.updateOne(
        { _id: currentObjectId },
        shouldFollow
          ? { $addToSet: { following: targetObjectId } }
          : { $pull: { following: targetObjectId } },
      ),
      this.userModel.updateOne(
        { _id: targetObjectId },
        shouldFollow
          ? {
              $addToSet: { followers: currentObjectId },
              $pull: { followRequests: currentObjectId },
            }
          : {
              $pull: {
                followers: currentObjectId,
                followRequests: currentObjectId,
              },
            },
      ),
    ]);

    if (
      shouldFollow &&
      !isAlreadyFollowing &&
      currentUserUpdate.modifiedCount > 0
    ) {
      await this.notificationsService.create({
        actorId: currentUserId,
        recipientId: targetUserId,
        type: 'follow',
      });
    }

    const updatedTargetUser = await this.userModel.findById(targetObjectId);

    if (!updatedTargetUser) {
      throw new NotFoundException('User not found');
    }

    return this.userResponseMapper.toNetworkUser(
      updatedTargetUser,
      currentUserId,
    );
  }

  async acceptFollowRequest(currentUserId: string, requesterUserId: string) {
    const { currentObjectId, targetObjectId: requesterObjectId } =
      await this.relationshipService.assertRelationshipTarget(
        currentUserId,
        requesterUserId,
        'You cannot accept a follow request from yourself',
        { requireCurrentUser: true },
      );
    const recipientUpdate = await this.userModel.updateOne(
      { _id: currentObjectId, followRequests: requesterObjectId },
      {
        $addToSet: { followers: requesterObjectId },
        $pull: { followRequests: requesterObjectId },
      },
    );

    if (recipientUpdate.modifiedCount === 0) {
      throw new NotFoundException('Follow request not found');
    }

    await this.userModel.updateOne(
      { _id: requesterObjectId },
      { $addToSet: { following: currentObjectId } },
    );
    await this.notificationsService.create({
      actorId: currentUserId,
      recipientId: requesterUserId,
      type: 'follow_accept',
    });

    const requester = await this.userModel.findById(requesterObjectId);

    if (!requester) {
      throw new NotFoundException('User not found');
    }

    return this.userResponseMapper.toNetworkUser(requester, currentUserId);
  }

  async declineFollowRequest(currentUserId: string, requesterUserId: string) {
    const { currentObjectId, targetObjectId: requesterObjectId } =
      await this.relationshipService.assertRelationshipTarget(
        currentUserId,
        requesterUserId,
        'You cannot decline a follow request from yourself',
        { requireCurrentUser: true },
      );
    const result = await this.userModel.updateOne(
      { _id: currentObjectId, followRequests: requesterObjectId },
      { $pull: { followRequests: requesterObjectId } },
    );

    if (result.modifiedCount === 0) {
      throw new NotFoundException('Follow request not found');
    }

    return { id: requesterUserId, ok: true };
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
          $pull: {
            followRequests: targetObjectId,
            followers: targetObjectId,
            following: targetObjectId,
          },
        },
      ),
      this.userModel.updateOne(
        { _id: targetObjectId },
        {
          $pull: {
            followRequests: currentObjectId,
            followers: currentObjectId,
            following: currentObjectId,
          },
        },
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

  private async findNetworkUserPage({
    currentUserId,
    filter,
    query,
    scope,
  }: {
    currentUserId?: string;
    filter: QueryFilter<UserDocument>;
    query: UserPageQuery;
    scope: string;
  }) {
    const limit = parsePageLimit(query.limit, 30, 50);
    const cursor = decodeCursor(scope, query.cursor);
    let cursorFilter: QueryFilter<UserDocument> | null = null;

    if (cursor) {
      if (!Types.ObjectId.isValid(cursor.id)) {
        throw new BadRequestException('Invalid pagination cursor');
      }

      cursorFilter = {
        $or: [
          { usernameLower: { $gt: cursor.sortValue } },
          {
            _id: { $gt: new Types.ObjectId(cursor.id) },
            usernameLower: cursor.sortValue,
          },
        ],
      };
    }

    const users = await this.userModel
      .find(cursorFilter ? { $and: [filter, cursorFilter] } : filter)
      .sort({ usernameLower: 1, _id: 1 })
      .limit(limit + 1)
      .exec();
    const page = buildCursorPage(users, limit, (user) =>
      encodeCursor(scope, {
        id: this.getUserId(user),
        sortValue: user.usernameLower,
      }),
    );

    return {
      ...page,
      items: page.items.map((user) =>
        this.userResponseMapper.toNetworkUser(user, currentUserId),
      ),
    };
  }

  private toObjectIds(userIds: Set<string>) {
    return [...userIds]
      .filter((userId) => Types.ObjectId.isValid(userId))
      .map((userId) => new Types.ObjectId(userId));
  }

  private getUserId(user: UserDocument) {
    return this.userResponseMapper.getUserId(user);
  }

  private withCanonicalIdentity(userData: Partial<User>): Partial<User> {
    const normalized = { ...userData };

    if (typeof userData.email === 'string') {
      normalized.email = normalizeEmail(userData.email);
      normalized.emailLower = normalized.email;
    }

    if (typeof userData.username === 'string') {
      normalized.username = normalizeUsername(userData.username);
      normalized.usernameLower = normalizeUsernameLower(userData.username);
    }

    return normalized;
  }

  private throwIdentityConflict(error: unknown): never {
    const duplicateField = getDuplicateIdentityField(error);

    if (!duplicateField) {
      throw error;
    }

    if (duplicateField === 'email') {
      throw new ConflictException('Email is already in use');
    }

    if (duplicateField === 'username') {
      throw new ConflictException('Username is already in use');
    }

    throw new ConflictException('Email or username is already in use');
  }

  private assertValidAvatarUrl(avatarUrl: string) {
    if (!avatarUrl) {
      return;
    }

    if (avatarUrl.length > MAX_AVATAR_URL_LENGTH) {
      throw new BadRequestException('Avatar image URL is too large');
    }

    if (
      !isTrustedUploadUrl({
        directory: 'avatars',
        publicApiUrl: this.configService.get<string>('PUBLIC_API_URL'),
        url: avatarUrl,
      })
    ) {
      throw new BadRequestException(
        'Avatar must reference an uploaded avatar image',
      );
    }
  }
}
