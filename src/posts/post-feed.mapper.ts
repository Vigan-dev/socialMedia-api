import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';

import type {
  FeedPostResponse,
  PublicPostResponse,
} from './dto/post-response.dto';
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
    recommendationReasons?: string[],
  ): FeedPostResponse {
    const authorName = post.author?.username ?? 'Unknown User';
    const createdAt = post.createdAt ?? new Date();
    const repost = this.toRepostResponse(
      post.repostOf,
      currentUserId,
      hiddenAuthorIds,
    );

    return {
      id: post._id.toString(),
      authorId: post.author?._id?.toString(),
      user: authorName,
      handle: `@${authorName.toLowerCase().replace(/\s+/g, '_')}`,
      hashtags: post.hashtags ?? [],
      avatarBg: 'from-indigo-600 to-violet-600',
      avatarText: authorName.slice(0, 2).toUpperCase(),
      avatarUrl: post.author?.avatarUrl || null,
      content: post.content,
      time: createdAt.toISOString(),
      likes: (post.likedBy ?? []).length,
      mediaUrls: post.mediaUrls ?? [],
      ...(recommendationReasons
        ? { recommendation: { reasons: recommendationReasons } }
        : {}),
      ...(repost ? { repost } : {}),
      reposts: post.repostsCount ?? 0,
      repostType: post.repostType,
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
      isSaved: this.isSavedByViewer(post.savedBy, currentUserId),
      isOwnPost: currentUserId
        ? post.author?._id?.toString() === currentUserId
        : false,
      isPinned: post.isPinned ?? false,
      isReposted: this.isRepostedByViewer(post.repostedBy, currentUserId),
      isFollowing: currentUserId
        ? Boolean(
            post.author?.followers?.some(
              (followerId) => followerId.toString() === currentUserId,
            ),
          )
        : false,
    };
  }

  toPublicPost(
    post: PostWithAuthor,
    currentUserId?: string,
    hiddenAuthorIds = new Set<string>(),
  ): PublicPostResponse {
    const feedPost = this.toFeedPost(post, currentUserId, hiddenAuthorIds);
    const commentItems: PublicPostResponse['commentItems'] =
      feedPost.commentItems.map((comment) => ({
        content: comment.content,
        id: comment.id,
        likes: comment.likes,
        replies: comment.replies.map((reply) => ({
          content: reply.content,
          id: reply.id,
          likes: reply.likes,
          time: reply.time,
          user: reply.user,
        })),
        time: comment.time,
        user: comment.user,
      }));
    const comments = this.countPublicComments(commentItems);

    return {
      avatarBg: feedPost.avatarBg,
      avatarText: feedPost.avatarText,
      avatarUrl: feedPost.avatarUrl,
      commentItems,
      comments,
      content: feedPost.content,
      handle: feedPost.handle,
      hashtags: feedPost.hashtags,
      id: feedPost.id,
      likes: feedPost.likes,
      mediaUrls: feedPost.mediaUrls,
      isPinned: feedPost.isPinned,
      repost: feedPost.repost,
      reposts: feedPost.reposts,
      repostType: feedPost.repostType,
      time: feedPost.time,
      user: feedPost.user,
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

  private countPublicComments(comments: PublicPostResponse['commentItems']) {
    return comments.reduce(
      (count, comment) => count + 1 + comment.replies.length,
      0,
    );
  }

  private isVisibleToViewer({
    author,
    currentUserId,
    hiddenAuthorIds,
    hiddenBy,
  }: FeedContentVisibilityInput) {
    const authorId = author?._id?.toString();
    const canViewPrivateContent =
      author?.profileVisibility !== 'private' ||
      authorId === currentUserId ||
      Boolean(
        currentUserId &&
        author?.followers?.some(
          (followerId) => followerId.toString() === currentUserId,
        ),
      );
    if (
      author?.isSuspended ||
      !canViewPrivateContent ||
      hiddenAuthorIds.has(authorId ?? '')
    ) {
      return false;
    }

    if (!currentUserId) return true;

    const isHiddenByViewer = (hiddenBy ?? []).some(
      (hiddenUserId) => hiddenUserId.toString() === currentUserId,
    );

    return !isHiddenByViewer;
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

  private isSavedByViewer(
    savedBy: Types.ObjectId[] | undefined,
    currentUserId?: string,
  ) {
    return currentUserId
      ? (savedBy ?? []).some(
          (savedUserId) => savedUserId.toString() === currentUserId,
        )
      : false;
  }

  private isRepostedByViewer(
    repostedBy: Types.ObjectId[] | undefined,
    currentUserId?: string,
  ) {
    return currentUserId
      ? (repostedBy ?? []).some((id) => id.toString() === currentUserId)
      : false;
  }

  private toRepostResponse(
    repost: PostWithAuthor | null | undefined,
    currentUserId: string | undefined,
    hiddenAuthorIds: Set<string>,
  ) {
    if (
      !repost?.author ||
      repost.isArchived ||
      repost.isHidden ||
      !this.isVisibleToViewer({
        author: repost.author,
        currentUserId,
        hiddenAuthorIds,
        hiddenBy: repost.hiddenBy,
      })
    ) {
      return undefined;
    }

    const username = repost.author.username;
    return {
      content: repost.content,
      handle: `@${username.toLowerCase().replace(/\s+/g, '_')}`,
      id: repost._id.toString(),
      mediaUrls: repost.mediaUrls ?? [],
      time: (repost.createdAt ?? new Date()).toISOString(),
      user: username,
    };
  }
}
