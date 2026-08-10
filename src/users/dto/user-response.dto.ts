import type {
  MessagePrivacy,
  ProfileVisibility,
  UserStatus,
} from '../user.constants';

export type NotificationSettingsResponse = {
  comments: boolean;
  follows: boolean;
  likes: boolean;
  mentions: boolean;
  messages: boolean;
};

export type UserProfileResponse = {
  avatarUrl: string | null;
  bio: string;
  email: string;
  followersCount: number;
  followingCount: number;
  id: string;
  isEmailVerified: boolean;
  notificationSettings: NotificationSettingsResponse;
  profileVisibility: ProfileVisibility;
  privacy: {
    allowMessagesFrom: MessagePrivacy;
    allowMentionsFrom: MessagePrivacy;
  };
  role: string;
  showOnlineStatus: boolean;
  status: UserStatus;
  twoFactorEnabled: boolean;
  username: string;
};

export type NetworkUserResponse = {
  avatarUrl: string | null;
  followersCount: number;
  followingCount: number;
  handle: string;
  id: string;
  isFollowing: boolean;
  isFollowRequested: boolean;
  name: string;
  profileVisibility: ProfileVisibility;
  role: string;
  status: UserStatus | null;
};

export type PublicUserProfileResponse = {
  avatarUrl: string | null;
  bio: string;
  canViewContent: boolean;
  followersCount: number;
  followingCount: number;
  handle: string;
  id: string;
  isFollowing: boolean;
  isFollowRequested: boolean;
  name: string;
  profileVisibility: ProfileVisibility;
  role: string;
  status: UserStatus | null;
};
