import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export const AUTH_EVENT_TYPES = [
  'login_failure',
  'login_locked',
  'login_success',
  'password_change_failed',
  'password_changed',
  'password_reset',
  'sessions_revoked',
] as const;

export type AuthEventType = (typeof AUTH_EVENT_TYPES)[number];
export type AuthEventDocument = HydratedDocument<AuthEvent> & {
  _id: Types.ObjectId;
  createdAt: Date;
};

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  versionKey: false,
})
export class AuthEvent {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user!: Types.ObjectId;

  @Prop({ type: String, enum: AUTH_EVENT_TYPES, required: true })
  type!: AuthEventType;

  @Prop({ required: true, maxlength: 64 })
  ip!: string;

  @Prop({ required: true, maxlength: 512 })
  userAgent!: string;
}

export const AuthEventSchema = SchemaFactory.createForClass(AuthEvent);

AuthEventSchema.index({ user: 1, createdAt: -1 });
AuthEventSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 },
);
