import { Types } from 'mongoose';
import type { PostWithAuthor } from './post-feed.types';
import {
  buildRecommendationProfile,
  rankRecommendedPosts,
  scoreRecommendedPost,
} from './post-recommendation';

function recommendedPost({
  authorId = new Types.ObjectId(),
  createdAt = new Date('2026-08-10T10:00:00.000Z'),
  hashtags = [],
  id = new Types.ObjectId(),
  likes = 0,
}: {
  authorId?: Types.ObjectId;
  createdAt?: Date;
  hashtags?: string[];
  id?: Types.ObjectId;
  likes?: number;
} = {}): PostWithAuthor {
  return {
    _id: id,
    author: {
      _id: authorId,
      email: 'author@example.com',
      username: 'Author',
    },
    commentsCount: 0,
    content: 'Recommended post',
    createdAt,
    hashtags,
    likedBy: Array.from({ length: likes }, () => new Types.ObjectId()),
  };
}

describe('post recommendation ranking', () => {
  const now = new Date('2026-08-10T12:00:00.000Z').getTime();

  it('builds stronger topic affinity from saves than likes', () => {
    const viewerId = new Types.ObjectId();
    const likedPostId = new Types.ObjectId();
    const savedPostId = new Types.ObjectId();
    const profile = buildRecommendationProfile({
      followingIds: [],
      signals: [
        {
          _id: likedPostId,
          author: new Types.ObjectId(),
          hashtags: ['typescript'],
          likedBy: [viewerId],
        },
        {
          _id: savedPostId,
          author: new Types.ObjectId(),
          hashtags: ['nestjs'],
          savedBy: [viewerId],
        },
      ],
      viewerId: viewerId.toString(),
    });

    expect(profile.topicWeights.get('typescript')).toBe(3);
    expect(profile.topicWeights.get('nestjs')).toBe(4);
    expect(profile.interactedPostIds).toEqual(
      new Set([likedPostId.toString(), savedPostId.toString()]),
    );
  });

  it('ranks topic matches above generic posts with equal recency and engagement', () => {
    const viewerId = new Types.ObjectId();
    const profile = buildRecommendationProfile({
      followingIds: [],
      signals: [
        {
          _id: new Types.ObjectId(),
          author: new Types.ObjectId(),
          hashtags: ['typescript'],
          savedBy: [viewerId],
        },
      ],
      viewerId: viewerId.toString(),
    });
    const matching = recommendedPost({ hashtags: ['typescript'] });
    const generic = recommendedPost({ hashtags: ['travel'] });

    expect(scoreRecommendedPost(matching, profile, now)).toBeGreaterThan(
      scoreRecommendedPost(generic, profile, now),
    );
  });

  it('limits one creator to two posts before filling from other creators', () => {
    const viewerId = new Types.ObjectId();
    const dominantAuthorId = new Types.ObjectId();
    const otherAuthorId = new Types.ObjectId();
    const profile = buildRecommendationProfile({
      followingIds: [],
      signals: [],
      viewerId: viewerId.toString(),
    });
    const posts = [
      recommendedPost({ authorId: dominantAuthorId, likes: 10 }),
      recommendedPost({ authorId: dominantAuthorId, likes: 9 }),
      recommendedPost({ authorId: dominantAuthorId, likes: 8 }),
      recommendedPost({ authorId: otherAuthorId }),
    ];

    const ranked = rankRecommendedPosts(posts, profile, 3, now);

    expect(
      ranked.filter(
        (post) => post.author?._id.toString() === dominantAuthorId.toString(),
      ),
    ).toHaveLength(2);
    expect(
      ranked.some(
        (post) => post.author?._id.toString() === otherAuthorId.toString(),
      ),
    ).toBe(true);
  });
});
