import { Types } from 'mongoose';
import type { PostWithAuthor } from './post-feed.types';

type RecommendationCommentSignal = {
  author?: Types.ObjectId;
  replies?: Array<{ author?: Types.ObjectId }>;
};

export type RecommendationSignal = {
  _id: Types.ObjectId;
  author: Types.ObjectId;
  comments?: RecommendationCommentSignal[];
  hashtags?: string[];
  likedBy?: Types.ObjectId[];
  savedBy?: Types.ObjectId[];
};

export type RecommendationProfile = {
  creatorWeights: Map<string, number>;
  followingIds: Set<string>;
  interactedPostIds: Set<string>;
  topicWeights: Map<string, number>;
  viewerId: string;
};

const maxTopicWeight = 20;
const maxCreatorWeight = 8;
const maxPostsPerCreator = 2;

function includesUser(ids: Types.ObjectId[] | undefined, userId: string) {
  return (ids ?? []).some((id) => id.toString() === userId);
}

function hasCommented(
  comments: RecommendationCommentSignal[] | undefined,
  userId: string,
) {
  return (comments ?? []).some(
    (comment) =>
      comment.author?.toString() === userId ||
      (comment.replies ?? []).some(
        (reply) => reply.author?.toString() === userId,
      ),
  );
}

function incrementWeight(
  weights: Map<string, number>,
  key: string,
  amount: number,
  maximum: number,
) {
  weights.set(key, Math.min((weights.get(key) ?? 0) + amount, maximum));
}

export function buildRecommendationProfile({
  followingIds,
  signals,
  viewerId,
}: {
  followingIds: Types.ObjectId[];
  signals: RecommendationSignal[];
  viewerId: string;
}): RecommendationProfile {
  const creatorWeights = new Map<string, number>();
  const interactedPostIds = new Set<string>();
  const topicWeights = new Map<string, number>();

  for (const signal of signals) {
    const authorId = signal.author.toString();
    const isOwnPost = authorId === viewerId;
    const isLiked = includesUser(signal.likedBy, viewerId);
    const isSaved = includesUser(signal.savedBy, viewerId);
    const isCommented = hasCommented(signal.comments, viewerId);
    const topicWeight =
      Number(isOwnPost) +
      Number(isLiked) * 3 +
      Number(isSaved) * 4 +
      Number(isCommented) * 2;

    if (isLiked || isSaved || isCommented) {
      interactedPostIds.add(signal._id.toString());
    }

    if (!isOwnPost) {
      incrementWeight(
        creatorWeights,
        authorId,
        Number(isLiked) * 2 + Number(isSaved) * 3 + Number(isCommented) * 2,
        maxCreatorWeight,
      );
    }

    if (topicWeight > 0) {
      for (const hashtag of signal.hashtags ?? []) {
        incrementWeight(topicWeights, hashtag, topicWeight, maxTopicWeight);
      }
    }
  }

  return {
    creatorWeights,
    followingIds: new Set(followingIds.map((id) => id.toString())),
    interactedPostIds,
    topicWeights,
    viewerId,
  };
}

export function scoreRecommendedPost(
  post: PostWithAuthor,
  profile: RecommendationProfile,
  now = Date.now(),
) {
  const authorId = post.author?._id.toString() ?? '';
  const ageInHours = Math.max(
    0,
    (now - (post.createdAt?.getTime() ?? 0)) / 3_600_000,
  );
  const recencyScore = 12 / (1 + ageInHours / 24);
  const engagementScore =
    Math.log2(1 + (post.likedBy?.length ?? 0) + (post.commentsCount ?? 0)) * 3;
  const topicScore = Math.min(
    18,
    (post.hashtags ?? []).reduce(
      (score, hashtag) => score + (profile.topicWeights.get(hashtag) ?? 0),
      0,
    ) * 0.8,
  );
  const creatorScore = Math.min(6, profile.creatorWeights.get(authorId) ?? 0);
  const followingScore = profile.followingIds.has(authorId) ? 4 : 0;
  const discoveryBoost = profile.followingIds.has(authorId) ? 0 : 1.5;
  const interactionPenalty = profile.interactedPostIds.has(post._id.toString())
    ? -6
    : 0;

  return (
    recencyScore +
    engagementScore +
    topicScore +
    creatorScore +
    followingScore +
    discoveryBoost +
    interactionPenalty
  );
}

export function rankRecommendedPosts(
  posts: PostWithAuthor[],
  profile: RecommendationProfile,
  limit: number,
  now = Date.now(),
) {
  const ranked = [...posts]
    .filter((post) => Boolean(post.author))
    .sort(
      (left, right) =>
        scoreRecommendedPost(right, profile, now) -
          scoreRecommendedPost(left, profile, now) ||
        (right.createdAt?.getTime() ?? 0) - (left.createdAt?.getTime() ?? 0) ||
        right._id.toString().localeCompare(left._id.toString()),
    );
  const selected: PostWithAuthor[] = [];
  const selectedIds = new Set<string>();
  const authorCounts = new Map<string, number>();

  for (const post of ranked) {
    const authorId = post.author?._id.toString() ?? '';

    if ((authorCounts.get(authorId) ?? 0) >= maxPostsPerCreator) continue;

    selected.push(post);
    selectedIds.add(post._id.toString());
    authorCounts.set(authorId, (authorCounts.get(authorId) ?? 0) + 1);

    if (selected.length === limit) return selected;
  }

  for (const post of ranked) {
    if (selectedIds.has(post._id.toString())) continue;

    selected.push(post);
    if (selected.length === limit) break;
  }

  return selected;
}
