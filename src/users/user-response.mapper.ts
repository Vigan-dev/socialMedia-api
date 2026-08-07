import { Injectable } from '@nestjs/common';
import type {
  NetworkUserResponse,
  PublicUserProfileResponse,
  UserProfileResponse,
} from './dto/user-response.dto';
import type { UserDocument } from './schemas/user.schema';

@Injectable()
export class UserResponseMapper {
  toProfile(user: UserDocument): UserProfileResponse {
    return {
      id: this.getUserId(user),
      username: user.username,
      email: user.email,
      role: user.role,
      avatarUrl: user.avatarUrl || null,
      bio: user.bio ?? '',
      followersCount: (user.followers ?? []).length,
      followingCount: (user.following ?? []).length,
      notificationSettings: {
        comments: user.notificationSettings?.comments ?? true,
        follows: user.notificationSettings?.follows ?? true,
        likes: user.notificationSettings?.likes ?? true,
        mentions: user.notificationSettings?.mentions ?? true,
        messages: user.notificationSettings?.messages ?? true,
      },
      profileVisibility: user.profileVisibility ?? 'public',
      privacy: {
        allowMessagesFrom: user.privacy?.allowMessagesFrom ?? 'everyone',
        allowMentionsFrom: user.privacy?.allowMentionsFrom ?? 'everyone',
      },
      showOnlineStatus: user.showOnlineStatus ?? true,
      status: user.status ?? 'available',
    };
  }

  toNetworkUser(
    user: UserDocument,
    currentUserId?: string,
  ): NetworkUserResponse {
    return {
      id: this.getUserId(user),
      name: user.username,
      handle: `@${user.username.toLowerCase().replace(/\s+/g, '_')}`,
      role: user.role,
      avatarUrl: user.avatarUrl || null,
      status:
        user.showOnlineStatus === false ? null : (user.status ?? 'available'),
      followersCount: (user.followers ?? []).length,
      followingCount: (user.following ?? []).length,
      isFollowing: currentUserId
        ? (user.followers ?? []).some((id) => id.toString() === currentUserId)
        : false,
      isFollowRequested: currentUserId
        ? (user.followRequests ?? []).some(
            (id) => id.toString() === currentUserId,
          )
        : false,
      profileVisibility: user.profileVisibility ?? 'public',
    };
  }

  toPublicProfile(
    user: UserDocument,
    currentUserId?: string,
  ): PublicUserProfileResponse {
    const isFollowing = currentUserId
      ? (user.followers ?? []).some((id) => id.toString() === currentUserId)
      : false;
    const profileVisibility = user.profileVisibility ?? 'public';

    return {
      id: this.getUserId(user),
      name: user.username,
      handle: `@${user.username.toLowerCase().replace(/\s+/g, '_')}`,
      role: user.role,
      avatarUrl: user.avatarUrl || null,
      bio: user.bio ?? '',
      canViewContent:
        profileVisibility === 'public' ||
        this.getUserId(user) === currentUserId ||
        isFollowing,
      followersCount: (user.followers ?? []).length,
      followingCount: (user.following ?? []).length,
      isFollowing,
      isFollowRequested: currentUserId
        ? (user.followRequests ?? []).some(
            (id) => id.toString() === currentUserId,
          )
        : false,
      profileVisibility,
      status:
        user.showOnlineStatus === false ? null : (user.status ?? 'available'),
    };
  }

  getUserId(user: UserDocument) {
    return user._id.toString();
  }
}
