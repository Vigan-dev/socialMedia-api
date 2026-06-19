import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

export type PostDocument = HydratedDocument<Post>;

@Schema({ _id: true, timestamps: true })
export class PostReply {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  author!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 280 })
  content!: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: User.name }], default: [] })
  likedBy!: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: User.name }], default: [] })
  hiddenBy!: Types.ObjectId[];
}

export const PostReplySchema = SchemaFactory.createForClass(PostReply);

@Schema({ _id: true, timestamps: true })
export class PostComment {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  author!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 280 })
  content!: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: User.name }], default: [] })
  likedBy!: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: User.name }], default: [] })
  hiddenBy!: Types.ObjectId[];

  @Prop({ type: [PostReplySchema], default: [] })
  replies!: PostReply[];
}

export const PostCommentSchema = SchemaFactory.createForClass(PostComment);

@Schema({ timestamps: true })
export class Post {
  @Prop({ required: true, trim: true, maxlength: 500 })
  content!: string;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  author!: Types.ObjectId;

  @Prop({ type: [{ type: Types.ObjectId, ref: User.name }], default: [] })
  likedBy!: Types.ObjectId[];

  @Prop({ type: [PostCommentSchema], default: [] })
  comments!: PostComment[];

  @Prop({ default: 0 })
  commentsCount!: number;

  @Prop({ type: [String], default: [] })
  mediaUrls!: string[];

  @Prop({ type: [{ type: Types.ObjectId, ref: User.name }], default: [] })
  hiddenBy!: Types.ObjectId[];
}

export const PostSchema = SchemaFactory.createForClass(Post);

PostSchema.index({ createdAt: -1 });
PostSchema.index({ author: 1, createdAt: -1 });
PostSchema.index({ hiddenBy: 1 });
