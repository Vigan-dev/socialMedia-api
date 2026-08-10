import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';
import { extractHashtags } from '../post-hashtags';

export type PostDocument = HydratedDocument<Post>;

type PostContentValidationContext = {
  mediaUrls?: string[];
};

function hasPostContentOrMedia(
  this: PostContentValidationContext,
  value?: string | null,
) {
  const hasContent = typeof value === 'string' && value.trim().length > 0;
  const hasMedia =
    Array.isArray(this.mediaUrls) &&
    this.mediaUrls.some((url) => url.trim().length > 0);

  return hasContent || hasMedia;
}

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
  @Prop({
    default: '',
    trim: true,
    maxlength: 500,
    validate: {
      validator: hasPostContentOrMedia,
      message: 'Post content or media is required',
    },
  })
  content!: string;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  author!: Types.ObjectId;

  @Prop({ type: [{ type: Types.ObjectId, ref: User.name }], default: [] })
  likedBy!: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: User.name }], default: [] })
  savedBy!: Types.ObjectId[];

  @Prop({ type: [PostCommentSchema], default: [] })
  comments!: PostComment[];

  @Prop({ default: 0 })
  commentsCount!: number;

  @Prop({ type: [String], default: [] })
  mediaUrls!: string[];

  @Prop({ type: [String], default: [] })
  hashtags!: string[];

  @Prop({ default: false, index: true })
  isArchived!: boolean;

  @Prop({ default: false, index: true })
  isHidden!: boolean;

  @Prop({ type: [{ type: Types.ObjectId, ref: User.name }], default: [] })
  hiddenBy!: Types.ObjectId[];
}

export const PostSchema = SchemaFactory.createForClass(Post);

PostSchema.pre('validate', function normalizePostHashtags() {
  this.hashtags = extractHashtags(this.content ?? '');
});

PostSchema.index({ createdAt: -1, _id: -1 });
PostSchema.index({ author: 1, createdAt: -1, _id: -1 });
PostSchema.index({ hashtags: 1, createdAt: -1 });
PostSchema.index({ hiddenBy: 1 });
PostSchema.index({ likedBy: 1, createdAt: -1, _id: -1 });
PostSchema.index({ savedBy: 1, createdAt: -1, _id: -1 });
PostSchema.index({ 'comments.author': 1, createdAt: -1, _id: -1 });
PostSchema.index({ 'comments.replies.author': 1, createdAt: -1, _id: -1 });
