import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';

import type { FeedPostResponse } from './dto/post-response.dto';
import type {
  PopulatedAuthor,
  PopulatedComment,
  PostWithAuthor,
} from './post-feed.types';

type FeedContentVisibilityInput = {
  author?: PopulatedAuthor | null;
  currentUserId?: string;
  hiddenAuthorIds: Set<string>;
  hiddenBy?: Types.ObjectId[];
};

@Injectable()
export class PostFeedMapper {
  toFeedPost(
    post: PostWithAuthor,
    currentUserId?: string,
    hiddenAuthorIds = new Set<string>(),
  ): FeedPostResponse {
    const authorName = post.author?.username ?? 'Unknown User';
    const createdAt = post.createdAt ?? new Date();

    return {
      id: post._id.toString(),
      authorId: post.author?._id?.toString(),
      user: authorName,
      handle: `@${authorName.toLowerCase().replace(/\s+/g, '_')}`,
      avatarBg: 'from-indigo-600 to-violet-600',
      avatarText: authorName.slice(0, 2).toUpperCase(),
      avatarUrl: post.author?.avatarUrl || null,
      content: post.content,
      time: createdAt.toISOString(),
      likes: (post.likedBy ?? []).length,
      mediaUrls: post.mediaUrls ?? [],
      comments:
        post.commentsCount ?? this.countResponseComments(post.comments ?? []),
      commentItems: (post.comments ?? [])
        .filter((comment) =>
          this.isVisibleToViewer({
            author: comment.author,
            currentUserId,
            hiddenAuthorIds,
            hiddenBy: comment.hiddenBy,
          }),
        )
        .map((comment) => ({
          id: comment._id.toString(),
          user: comment.author?.username ?? 'Unknown User',
          content: comment.content,
          likes: (comment.likedBy ?? []).length,
          isLiked: this.isLikedByViewer(comment.likedBy, currentUserId),
          replies: (comment.replies ?? [])
            .filter((reply) =>
              this.isVisibleToViewer({
                author: reply.author,
                currentUserId,
                hiddenAuthorIds,
                hiddenBy: reply.hiddenBy,
              }),
            )
            .map((reply) => ({
              id: reply._id.toString(),
              user: reply.author?.username ?? 'Unknown User',
              content: reply.content,
              likes: (reply.likedBy ?? []).length,
              isLiked: this.isLikedByViewer(reply.likedBy, currentUserId),
              time: (reply.createdAt ?? createdAt).toISOString(),
            })),
          time: (comment.createdAt ?? createdAt).toISOString(),
        })),
      isLiked: this.isLikedByViewer(post.likedBy, currentUserId),
      isOwnPost: currentUserId
        ? post.author?._id?.toString() === currentUserId
        : false,
      isFollowing: currentUserId
        ? Boolean(
            post.author?.followers?.some(
              (followerId) => followerId.toString() === currentUserId,
            ),
          )
        : false,
    };
  }

  scorePost(post: PostWithAuthor) {
    return (post.likedBy ?? []).length * 2 + (post.commentsCount ?? 0);
  }

  private countResponseComments(comments: PopulatedComment[]) {
    return comments.reduce(
      (count, comment) => count + 1 + (comment.replies?.length ?? 0),
      0,
    );
  }

  private isVisibleToViewer({
    author,
    currentUserId,
    hiddenAuthorIds,
    hiddenBy,
  }: FeedContentVisibilityInput) {
    if (!currentUserId) return true;

    const authorId = author?._id?.toString();
    const isHiddenByViewer = (hiddenBy ?? []).some(
      (hiddenUserId) => hiddenUserId.toString() === currentUserId,
    );

    return !isHiddenByViewer && !hiddenAuthorIds.has(authorId ?? '');
  }

  private isLikedByViewer(
    likedBy: Types.ObjectId[] | undefined,
    currentUserId?: string,
  ) {
    return currentUserId
      ? (likedBy ?? []).some(
          (likedUserId) => likedUserId.toString() === currentUserId,
        )
      : false;
  }
}
