import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Post } from '../../posts/schemas/post.schema';
import { User } from '../../users/schemas/user.schema';

export type NotificationDocument = HydratedDocument<Notification>;
export type NotificationType =
  | 'comment'
  | 'follow'
  | 'like'
  | 'mention'
  | 'message';

@Schema({ timestamps: true })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  recipient!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  actor!: Types.ObjectId;

  @Prop({
    enum: ['like', 'comment', 'follow', 'mention', 'message'],
    required: true,
  })
  type!: NotificationType;

  @Prop({ type: Types.ObjectId, ref: Post.name })
  post?: Types.ObjectId;

  @Prop({ trim: true, maxlength: 280, default: '' })
  content!: string;

  @Prop({ default: false })
  read!: boolean;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

NotificationSchema.index({ recipient: 1, createdAt: -1 });
