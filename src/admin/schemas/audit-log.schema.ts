import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

export type AuditLogDocument = HydratedDocument<AuditLog>;
export type AuditLogAction =
  | 'comment_deleted'
  | 'post_deleted'
  | 'report_actioned'
  | 'report_dismissed'
  | 'report_reopened'
  | 'report_reviewed'
  | 'user_suspended'
  | 'user_unsuspended';
export type AuditLogTargetType = 'comment' | 'post' | 'report' | 'user';

@Schema({ timestamps: true })
export class AuditLog {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  actor!: Types.ObjectId;

  @Prop({ required: true })
  actorEmail!: string;

  @Prop({ required: true })
  actorRole!: string;

  @Prop({
    required: true,
    enum: [
      'comment_deleted',
      'post_deleted',
      'report_actioned',
      'report_dismissed',
      'report_reopened',
      'report_reviewed',
      'user_suspended',
      'user_unsuspended',
    ],
  })
  action!: AuditLogAction;

  @Prop({ required: true, enum: ['comment', 'post', 'report', 'user'] })
  targetType!: AuditLogTargetType;

  @Prop({ required: true, index: true })
  targetId!: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata!: Record<string, unknown>;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ actor: 1, createdAt: -1 });
AuditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
