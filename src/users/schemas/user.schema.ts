import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { userRoles, type UserRole } from '../../auth/roles';
import {
  MESSAGE_PRIVACY_OPTIONS,
  PROFILE_VISIBILITY_OPTIONS,
  USER_STATUSES,
} from '../user.constants';
import type {
  MessagePrivacy,
  ProfileVisibility,
  UserStatus,
} from '../user.constants';
import {
  normalizeEmail,
  normalizeUsername,
  normalizeUsernameLower,
} from '../user-identity';

export type UserDocument = HydratedDocument<User> & { _id: Types.ObjectId };

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true })
  username!: string;

  @Prop({ required: true })
  usernameLower!: string;

  @Prop({ required: true, trim: true })
  email!: string;

  @Prop({ required: true })
  emailLower!: string;

  @Prop({ required: true, select: false })
  password!: string;

  @Prop({ select: false })
  refreshTokenHash?: string;

  @Prop({ select: false })
  passwordResetTokenHash?: string;

  @Prop({ select: false })
  passwordResetExpiresAt?: Date;

  @Prop({ default: 0, min: 0, select: false })
  failedLoginAttempts!: number;

  @Prop({ select: false })
  failedLoginWindowStartedAt?: Date;

  @Prop({ select: false })
  loginLockedUntil?: Date;

  @Prop({ default: 0, min: 0, select: false })
  securityVersion!: number;

  @Prop({ type: String, enum: userRoles, default: 'user' })
  role!: UserRole;

  @Prop({ default: false, index: true })
  isSuspended!: boolean;

  @Prop({ default: '' })
  suspensionReason!: string;

  @Prop({ default: '' })
  avatarUrl!: string;

  @Prop({ default: '' })
  bio!: string;

  @Prop({ type: String, enum: USER_STATUSES, default: 'available' })
  status!: UserStatus;

  @Prop({ default: true })
  showOnlineStatus!: boolean;

  @Prop({
    type: String,
    enum: PROFILE_VISIBILITY_OPTIONS,
    default: 'public',
    index: true,
  })
  profileVisibility!: ProfileVisibility;

  @Prop({
    type: {
      allowMessagesFrom: {
        type: String,
        enum: MESSAGE_PRIVACY_OPTIONS,
        default: 'everyone',
      },
      allowMentionsFrom: {
        type: String,
        enum: MESSAGE_PRIVACY_OPTIONS,
        default: 'everyone',
      },
    },
    default: { allowMessagesFrom: 'everyone', allowMentionsFrom: 'everyone' },
  })
  privacy!: {
    allowMessagesFrom: MessagePrivacy;
    allowMentionsFrom: MessagePrivacy;
  };

  @Prop({
    type: {
      likes: { type: Boolean, default: true },
      comments: { type: Boolean, default: true },
      follows: { type: Boolean, default: true },
      mentions: { type: Boolean, default: true },
      messages: { type: Boolean, default: true },
    },
    default: {
      likes: true,
      comments: true,
      follows: true,
      mentions: true,
      messages: true,
    },
  })
  notificationSettings!: {
    likes: boolean;
    comments: boolean;
    follows: boolean;
    mentions: boolean;
    messages: boolean;
  };

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  followers!: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  following!: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  followRequests!: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  blockedUsers!: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  mutedUsers!: Types.ObjectId[];

  @Prop({ type: [String], default: [] })
  mutedTopics!: string[];
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.pre('validate', function normalizeCanonicalIdentity() {
  if (this.email) {
    this.email = normalizeEmail(this.email);
    this.emailLower = this.email;
  }

  if (this.username) {
    this.username = normalizeUsername(this.username);
    this.usernameLower = normalizeUsernameLower(this.username);
  }
});

UserSchema.index(
  { emailLower: 1 },
  { name: 'user_email_lower_unique', unique: true },
);
UserSchema.index(
  { usernameLower: 1 },
  { name: 'user_username_lower_unique', unique: true },
);
UserSchema.index({ blockedUsers: 1 });
UserSchema.index({ followRequests: 1 });
UserSchema.index({ followers: 1 });
UserSchema.index({ following: 1 });
UserSchema.index({ mutedUsers: 1 });
