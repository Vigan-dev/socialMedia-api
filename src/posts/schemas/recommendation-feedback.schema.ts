import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';
import { Post } from './post.schema';

export const RECOMMENDATION_FEEDBACK_ACTIONS = [
  'not_interested',
  'show_fewer',
] as const;

export type RecommendationFeedbackAction =
  (typeof RECOMMENDATION_FEEDBACK_ACTIONS)[number];
export type RecommendationFeedbackDocument =
  HydratedDocument<RecommendationFeedback>;

@Schema({ timestamps: true })
export class RecommendationFeedback {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  user!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: Post.name, required: true })
  post!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  author!: Types.ObjectId;

  @Prop({ type: String, enum: RECOMMENDATION_FEEDBACK_ACTIONS, required: true })
  action!: RecommendationFeedbackAction;

  @Prop({ type: [String], default: [] })
  topics!: string[];
}

export const RecommendationFeedbackSchema = SchemaFactory.createForClass(
  RecommendationFeedback,
);

RecommendationFeedbackSchema.index(
  { user: 1, post: 1 },
  { name: 'recommendation_feedback_user_post_unique', unique: true },
);
RecommendationFeedbackSchema.index({ user: 1, createdAt: -1 });
