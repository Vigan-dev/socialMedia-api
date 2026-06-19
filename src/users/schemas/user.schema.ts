import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { userRoles, type UserRole } from '../../auth/roles';
import { MESSAGE_PRIVACY_OPTIONS, USER_STATUSES } from '../user.constants';
import type { MessagePrivacy, UserStatus } from '../user.constants';

export type UserDocument = HydratedDocument<User> & { _id: Types.ObjectId };

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true })
  username!: string;

  @Prop({ required: true, unique: true })
  email!: string;

  @Prop({ required: true, select: false })
  password!: string;

  @Prop({ select: false })
  refreshTokenHash?: string;

  @Prop({ select: false })
  passwordResetTokenHash?: string;

  @Prop({ select: false })
  passwordResetExpiresAt?: Date;

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
  blockedUsers!: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  mutedUsers!: Types.ObjectId[];
}

export const UserSchema = SchemaFactory.createForClass(User);
