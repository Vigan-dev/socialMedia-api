export type CommentReplyResponse = {
  content: string;
  id: string;
  isLiked: boolean;
  likes: number;
  time: string;
  user: string;
};

export type CommentResponse = {
  content: string;
  id: string;
  isLiked: boolean;
  likes: number;
  replies: CommentReplyResponse[];
  time: string;
  user: string;
};

export type PublicCommentReplyResponse = Omit<CommentReplyResponse, 'isLiked'>;

export type PublicCommentResponse = Omit<
  CommentResponse,
  'isLiked' | 'replies'
> & {
  replies: PublicCommentReplyResponse[];
};

export type FeedPostResponse = {
  authorId?: string;
  avatarBg: string;
  avatarText: string;
  avatarUrl: string | null;
  commentItems: CommentResponse[];
  comments: number;
  content: string;
  handle: string;
  hashtags: string[];
  id: string;
  isFollowing: boolean;
  isLiked: boolean;
  isOwnPost: boolean;
  isSaved: boolean;
  likes: number;
  mediaUrls: string[];
  recommendation?: {
    reasons: string[];
  };
  time: string;
  user: string;
};

export type PublicPostResponse = Omit<
  FeedPostResponse,
  | 'authorId'
  | 'commentItems'
  | 'isFollowing'
  | 'isLiked'
  | 'isOwnPost'
  | 'isSaved'
  | 'recommendation'
> & {
  commentItems: PublicCommentResponse[];
};
