import type { MessagePrivacy, UserStatus } from '../user.constants';

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
  notificationSettings: NotificationSettingsResponse;
  privacy: {
    allowMessagesFrom: MessagePrivacy;
    allowMentionsFrom: MessagePrivacy;
  };
  role: string;
  showOnlineStatus: boolean;
  status: UserStatus;
  username: string;
};

export type NetworkUserResponse = {
  avatarUrl: string | null;
  followersCount: number;
  followingCount: number;
  handle: string;
  id: string;
  isFollowing: boolean;
  name: string;
  role: string;
  status: UserStatus | null;
};
