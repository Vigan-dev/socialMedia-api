import { Types } from 'mongoose';
import type {
  PopulatedAuthor,
  PopulatedComment,
  PopulatedReply,
  PostWithAuthor,
} from './post-feed.types';

type MongooseObjectSource = {
  toObject<T>(options?: { depopulate?: boolean }): T;
};

type MaybePopulatedAuthor = Types.ObjectId | PopulatedAuthor | null | undefined;

type PostReplyObject = {
  _id: Types.ObjectId;
  author?: MaybePopulatedAuthor;
  content: string;
  createdAt?: Date;
  hiddenBy?: Types.ObjectId[];
  likedBy?: Types.ObjectId[];
};

type PostCommentObject = PostReplyObject & {
  replies?: PostReplyObject[];
};

type PostDocumentObject = {
  _id: Types.ObjectId;
  author?: MaybePopulatedAuthor;
  comments?: PostCommentObject[];
  commentsCount?: number;
  content: string;
  createdAt?: Date;
  hiddenBy?: Types.ObjectId[];
  likedBy?: Types.ObjectId[];
};

function isPopulatedAuthor(
  value: MaybePopulatedAuthor,
): value is PopulatedAuthor {
  return (
    Boolean(value) &&
    !(value instanceof Types.ObjectId) &&
    typeof value === 'object' &&
    value !== null &&
    '_id' in value &&
    'username' in value
  );
}

function mapAuthor(author: MaybePopulatedAuthor) {
  return isPopulatedAuthor(author) ? author : null;
}

function mapReply(reply: PostReplyObject): PopulatedReply {
  return {
    _id: reply._id,
    author: mapAuthor(reply.author),
    content: reply.content,
    createdAt: reply.createdAt,
    hiddenBy: reply.hiddenBy ?? [],
    likedBy: reply.likedBy ?? [],
  };
}

function mapComment(comment: PostCommentObject): PopulatedComment {
  return {
    ...mapReply(comment),
    replies: (comment.replies ?? []).map(mapReply),
  };
}

export function mapPostDocumentToFeedModel(
  post: MongooseObjectSource,
): PostWithAuthor {
  const data = post.toObject<PostDocumentObject>({ depopulate: false });

  return {
    _id: data._id,
    author: mapAuthor(data.author),
    comments: (data.comments ?? []).map(mapComment),
    commentsCount: data.commentsCount ?? 0,
    content: data.content,
    createdAt: data.createdAt,
    hiddenBy: data.hiddenBy ?? [],
    likedBy: data.likedBy ?? [],
  };
}

export function mapPostDocumentsToFeedModels(
  posts: MongooseObjectSource[],
): PostWithAuthor[] {
  return posts.map(mapPostDocumentToFeedModel);
}
