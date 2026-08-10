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

export type RecommendationFeedbackSignal = {
  action: 'not_interested' | 'show_fewer';
  author: Types.ObjectId;
  post: Types.ObjectId;
  topics?: string[];
};

export type RecommendationProfile = {
  creatorWeights: Map<string, number>;
  excludedPostIds: Set<string>;
  followingIds: Set<string>;
  interactedPostIds: Set<string>;
  mutedTopics: Set<string>;
  negativeCreatorWeights: Map<string, number>;
  negativeTopicWeights: Map<string, number>;
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
  feedback = [],
  followingIds,
  mutedTopics = [],
  signals,
  viewerId,
}: {
  feedback?: RecommendationFeedbackSignal[];
  followingIds: Types.ObjectId[];
  mutedTopics?: string[];
  signals: RecommendationSignal[];
  viewerId: string;
}): RecommendationProfile {
  const creatorWeights = new Map<string, number>();
  const excludedPostIds = new Set<string>();
  const interactedPostIds = new Set<string>();
  const negativeCreatorWeights = new Map<string, number>();
  const negativeTopicWeights = new Map<string, number>();
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

  for (const item of feedback) {
    const creatorPenalty = item.action === 'show_fewer' ? 5 : 2;
    const topicPenalty = item.action === 'show_fewer' ? 6 : 3;

    excludedPostIds.add(item.post.toString());
    incrementWeight(
      negativeCreatorWeights,
      item.author.toString(),
      creatorPenalty,
      30,
    );

    for (const topic of item.topics ?? []) {
      incrementWeight(negativeTopicWeights, topic, topicPenalty, 40);
    }
  }

  return {
    creatorWeights,
    excludedPostIds,
    followingIds: new Set(followingIds.map((id) => id.toString())),
    interactedPostIds,
    mutedTopics: new Set(mutedTopics),
    negativeCreatorWeights,
    negativeTopicWeights,
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
  const creatorPenalty = Math.min(
    12,
    profile.negativeCreatorWeights.get(authorId) ?? 0,
  );
  const topicPenalty = Math.min(
    20,
    (post.hashtags ?? []).reduce(
      (score, hashtag) =>
        score + (profile.negativeTopicWeights.get(hashtag) ?? 0),
      0,
    ),
  );
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
    interactionPenalty -
    creatorPenalty -
    topicPenalty
  );
}

export function explainRecommendedPost(
  post: PostWithAuthor,
  profile: RecommendationProfile,
) {
  const authorId = post.author?._id.toString() ?? '';
  const matchingTopics = (post.hashtags ?? [])
    .filter((topic) => (profile.topicWeights.get(topic) ?? 0) > 0)
    .sort(
      (left, right) =>
        (profile.topicWeights.get(right) ?? 0) -
        (profile.topicWeights.get(left) ?? 0),
    );
  const reasons: string[] = [];

  if (matchingTopics.length > 0) {
    reasons.push(`Because you engage with #${matchingTopics[0]}`);
  }

  if (profile.followingIds.has(authorId)) {
    reasons.push('Because you follow this creator');
  } else if ((profile.creatorWeights.get(authorId) ?? 0) > 0) {
    reasons.push('Because you engage with this creator');
  }

  if ((post.likedBy?.length ?? 0) + (post.commentsCount ?? 0) >= 5) {
    reasons.push('Popular with people in your network');
  }

  if (reasons.length === 0) {
    reasons.push('Suggested to help you discover something new');
  }

  return reasons.slice(0, 3);
}

export function rankRecommendedPosts(
  posts: PostWithAuthor[],
  profile: RecommendationProfile,
  limit: number,
  now = Date.now(),
) {
  const ranked = [...posts]
    .filter(
      (post) =>
        Boolean(post.author) &&
        !profile.excludedPostIds.has(post._id.toString()) &&
        !(post.hashtags ?? []).some((topic) => profile.mutedTopics.has(topic)),
    )
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
