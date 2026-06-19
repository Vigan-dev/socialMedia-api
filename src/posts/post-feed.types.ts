import { Types } from 'mongoose';

export type PopulatedAuthor = {
  _id: Types.ObjectId;
  username: string;
  email: string;
  avatarUrl?: string;
  followers?: Types.ObjectId[];
};

export type PopulatedReply = {
  _id: Types.ObjectId;
  author?: PopulatedAuthor | null;
  content: string;
  createdAt?: Date;
  hiddenBy?: Types.ObjectId[];
  likedBy?: Types.ObjectId[];
};

export type PopulatedComment = {
  _id: Types.ObjectId;
  author?: PopulatedAuthor | null;
  content: string;
  createdAt?: Date;
  hiddenBy?: Types.ObjectId[];
  likedBy?: Types.ObjectId[];
  replies?: PopulatedReply[];
};

export type PostWithAuthor = {
  _id: Types.ObjectId;
  author?: PopulatedAuthor | null;
  comments?: PopulatedComment[];
  commentsCount: number;
  content: string;
  createdAt?: Date;
  hiddenBy?: Types.ObjectId[];
  likedBy: Types.ObjectId[];
  mediaUrls?: string[];
};
