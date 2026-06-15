import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

export type ReportDocument = HydratedDocument<Report>;
export type ReportTargetType = 'post' | 'comment' | 'user';
export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'hate'
  | 'self_harm'
  | 'sexual_content'
  | 'violence'
  | 'other';

@Schema({ timestamps: true })
export class Report {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  reporter!: Types.ObjectId;

  @Prop({ enum: ['post', 'comment', 'user'], required: true, index: true })
  targetType!: ReportTargetType;

  @Prop({ required: true, index: true })
  targetId!: string;

  @Prop({
    enum: [
      'spam',
      'harassment',
      'hate',
      'self_harm',
      'sexual_content',
      'violence',
      'other',
    ],
    required: true,
  })
  reason!: ReportReason;

  @Prop({ default: '', trim: true, maxlength: 500 })
  details!: string;

  @Prop({
    default: 'open',
    enum: ['open', 'reviewed', 'dismissed', 'actioned'],
  })
  status!: string;
}

export const ReportSchema = SchemaFactory.createForClass(Report);

ReportSchema.index(
  { reporter: 1, targetType: 1, targetId: 1 },
  { unique: true },
);
