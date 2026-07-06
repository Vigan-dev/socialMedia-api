export const USER_STATUSES = ['available', 'away', 'busy'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const MESSAGE_PRIVACY_OPTIONS = [
  'everyone',
  'following',
  'none',
] as const;
export type MessagePrivacy = (typeof MESSAGE_PRIVACY_OPTIONS)[number];

export const PROFILE_VISIBILITY_OPTIONS = ['public', 'private'] as const;
export type ProfileVisibility = (typeof PROFILE_VISIBILITY_OPTIONS)[number];
