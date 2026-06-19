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

export type FeedPostResponse = {
  authorId?: string;
  avatarBg: string;
  avatarText: string;
  avatarUrl: string | null;
  commentItems: CommentResponse[];
  comments: number;
  content: string;
  handle: string;
  id: string;
  isFollowing: boolean;
  isLiked: boolean;
  isOwnPost: boolean;
  likes: number;
  mediaUrls: string[];
  time: string;
  user: string;
};
