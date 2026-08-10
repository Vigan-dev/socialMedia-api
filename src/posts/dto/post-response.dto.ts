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
  isPinned: boolean;
  isReposted: boolean;
  isSaved: boolean;
  likes: number;
  mediaUrls: string[];
  recommendation?: {
    reasons: string[];
  };
  repost?: {
    content: string;
    handle: string;
    id: string;
    mediaUrls: string[];
    time: string;
    user: string;
  };
  reposts: number;
  repostType?: 'quote' | 'repost';
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
  | 'isReposted'
  | 'isSaved'
  | 'recommendation'
> & {
  commentItems: PublicCommentResponse[];
};
