import { Types } from 'mongoose';

import { PostFeedMapper } from './post-feed.mapper';
import type { PostWithAuthor } from './post-feed.types';

describe('PostFeedMapper', () => {
  const mapper = new PostFeedMapper();

  it('maps post, comments, replies, and viewer state to the feed response', () => {
    const viewerId = new Types.ObjectId();
    const authorId = new Types.ObjectId();
    const commentAuthorId = new Types.ObjectId();
    const replyAuthorId = new Types.ObjectId();
    const createdAt = new Date('2026-06-15T10:00:00.000Z');

    const response = mapper.toFeedPost(
      {
        _id: new Types.ObjectId(),
        author: {
          _id: authorId,
          avatarUrl: 'https://example.com/avatar.png',
          email: 'author@example.com',
          followers: [viewerId],
          username: 'Author User',
        },
        comments: [
          {
            _id: new Types.ObjectId(),
            author: {
              _id: commentAuthorId,
              email: 'commenter@example.com',
              username: 'Commenter',
            },
            content: 'Visible comment',
            createdAt,
            hiddenBy: [],
            likedBy: [viewerId],
            replies: [
              {
                _id: new Types.ObjectId(),
                author: {
                  _id: replyAuthorId,
                  email: 'reply@example.com',
                  username: 'Reply User',
                },
                content: 'Visible reply',
                createdAt,
                hiddenBy: [],
                likedBy: [viewerId],
              },
            ],
          },
        ],
        commentsCount: 2,
        content: 'Mapped post',
        createdAt,
        likedBy: [viewerId],
      } satisfies PostWithAuthor,
      viewerId.toString(),
    );

    expect(response).toEqual(
      expect.objectContaining({
        avatarUrl: 'https://example.com/avatar.png',
        comments: 2,
        content: 'Mapped post',
        handle: '@author_user',
        isFollowing: true,
        isLiked: true,
        isOwnPost: false,
        likes: 1,
        time: createdAt.toISOString(),
        user: 'Author User',
      }),
    );
    expect(response.commentItems).toHaveLength(1);
    expect(response.commentItems?.[0]).toEqual(
      expect.objectContaining({
        content: 'Visible comment',
        isLiked: true,
        likes: 1,
        user: 'Commenter',
      }),
    );
    expect(response.commentItems?.[0].replies).toHaveLength(1);
    expect(response.commentItems?.[0].replies?.[0]).toEqual(
      expect.objectContaining({
        content: 'Visible reply',
        isLiked: true,
        likes: 1,
        user: 'Reply User',
      }),
    );
  });

  it('hides comments and replies hidden by viewer or authored by hidden users', () => {
    const viewerId = new Types.ObjectId();
    const hiddenAuthorId = new Types.ObjectId();
    const visibleAuthorId = new Types.ObjectId();
    const createdAt = new Date('2026-06-15T10:00:00.000Z');

    const response = mapper.toFeedPost(
      {
        _id: new Types.ObjectId(),
        author: {
          _id: visibleAuthorId,
          email: 'author@example.com',
          username: 'Author',
        },
        comments: [
          {
            _id: new Types.ObjectId(),
            author: {
              _id: visibleAuthorId,
              email: 'hidden@example.com',
              username: 'Hidden By Viewer',
            },
            content: 'Hidden by viewer',
            createdAt,
            hiddenBy: [viewerId],
            likedBy: [],
            replies: [],
          },
          {
            _id: new Types.ObjectId(),
            author: {
              _id: visibleAuthorId,
              email: 'visible@example.com',
              username: 'Visible',
            },
            content: 'Visible comment',
            createdAt,
            hiddenBy: [],
            likedBy: [],
            replies: [
              {
                _id: new Types.ObjectId(),
                author: {
                  _id: hiddenAuthorId,
                  email: 'hidden-author@example.com',
                  username: 'Hidden Author',
                },
                content: 'Hidden reply',
                createdAt,
                hiddenBy: [],
                likedBy: [],
              },
            ],
          },
        ],
        commentsCount: 2,
        content: 'Post',
        createdAt,
        likedBy: [],
      } satisfies PostWithAuthor,
      viewerId.toString(),
      new Set([hiddenAuthorId.toString()]),
    );

    expect(response.commentItems).toHaveLength(1);
    expect(response.commentItems?.[0].content).toBe('Visible comment');
    expect(response.commentItems?.[0].replies).toEqual([]);
  });
});
