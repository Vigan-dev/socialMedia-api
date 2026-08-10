import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Post } from './schemas/post.schema';
import type { PostDocument } from './schemas/post.schema';
import { User } from '../users/schemas/user.schema';
import type { UserDocument } from '../users/schemas/user.schema';
import { NotificationsService } from '../notifications/notifications.service';
import type { FeedPostResponse } from './dto/post-response.dto';
import type { PublicPostResponse } from './dto/post-response.dto';
import { RelationshipService } from '../users/relationship.service';
import { PostFeedMapper } from './post-feed.mapper';
import { PostReportsService } from './post-reports.service';
import {
  mapPostDocumentToFeedModel,
  mapPostDocumentsToFeedModels,
} from './post-document.mapper';
import type {
  PopulatedAuthor,
  PopulatedComment,
  PostWithAuthor,
} from './post-feed.types';
import { isTrustedUploadUrl } from '../uploads/upload-url.validation';
import { normalizeUsernameLower } from '../users/user-identity';
import { SavedPostsService } from './saved-posts.service';
import { isValidHashtag, normalizeHashtag } from './post-hashtags';
import {
  buildRecommendationProfile,
  rankRecommendedPosts,
} from './post-recommendation';
import type { RecommendationSignal } from './post-recommendation';

type AuthUser = {
  id: string;
};

type FeedQuery = {
  cursor?: string;
  feed?: string;
  limit?: string;
  sort?: string;
};

type FeedPageResponse = {
  hasMore: boolean;
  items: FeedPostResponse[];
  nextCursor: string | null;
};

type DiscoveryQuery = {
  limit?: string;
  tag?: string;
};

type SearchQuery = {
  limit?: string;
  query?: string;
};

type DiscoverablePostContext = {
  filter: Record<string, unknown>;
  followingIds: Types.ObjectId[];
  hiddenAuthorIds: Set<string>;
};

type LatestFeedCursor = {
  createdAt: Date;
  id?: Types.ObjectId;
};

type PublicViewerContext = {
  hiddenAuthorIds: Set<string>;
  viewerObjectId?: Types.ObjectId;
};

const recentTrendingWindowMultiplier = 3;
const discoveryCandidateMultiplier = 6;
const maxDiscoveryCandidates = 120;
const trendingWindowDays = 7;

function escapeRegularExpression(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseDiscoveryLimit(value?: string, fallback = 12) {
  return Math.min(Math.max(Number(value) || fallback, 1), 30);
}

function decodeLatestFeedCursor(cursor: string): LatestFeedCursor {
  let decoded: unknown;

  try {
    decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    decoded = null;
  }

  if (decoded && typeof decoded === 'object') {
    const value = decoded as Record<string, unknown>;

    if (
      typeof value.createdAt === 'string' &&
      typeof value.id === 'string' &&
      Types.ObjectId.isValid(value.id)
    ) {
      const createdAt = new Date(value.createdAt);

      if (!Number.isNaN(createdAt.getTime())) {
        return {
          createdAt,
          id: new Types.ObjectId(value.id),
        };
      }
    }
  }

  // Accept timestamp-only cursors issued before compound cursors were added.
  const legacyCreatedAt = new Date(cursor);

  if (!Number.isNaN(legacyCreatedAt.getTime())) {
    return { createdAt: legacyCreatedAt };
  }

  throw new BadRequestException('Invalid feed cursor');
}

function encodeLatestFeedCursor(
  post: Pick<PostWithAuthor, '_id' | 'createdAt'>,
): string | null {
  if (!post.createdAt) {
    return null;
  }

  return Buffer.from(
    JSON.stringify({
      createdAt: post.createdAt.toISOString(),
      id: post._id.toString(),
    }),
    'utf8',
  ).toString('base64url');
}

@Injectable()
export class PostsService {
  constructor(
    @InjectModel(Post.name)
    private readonly postModel: Model<PostDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly relationshipService: RelationshipService,
    private readonly postFeedMapper: PostFeedMapper,
    private readonly postReportsService: PostReportsService,
    private readonly configService: ConfigService,
    private readonly savedPostsService: SavedPostsService,
  ) {}

  async discover(
    userId: string,
    query: DiscoveryQuery = {},
  ): Promise<FeedPostResponse[]> {
    const limit = parseDiscoveryLimit(query.limit);
    const tag = query.tag ? normalizeHashtag(query.tag) : '';

    if (query.tag && !isValidHashtag(tag)) {
      throw new BadRequestException('A valid topic is required');
    }

    const context = await this.getDiscoverablePostContext(userId);
    const filter = tag
      ? { $and: [context.filter, { hashtags: tag }] }
      : context.filter;

    return this.findRankedDiscoveryPosts(filter, context, userId, limit);
  }

  async search(
    userId: string,
    query: SearchQuery,
  ): Promise<FeedPostResponse[]> {
    const searchQuery = query.query?.trim() ?? '';

    if (searchQuery.length < 2 || searchQuery.length > 80) {
      throw new BadRequestException(
        'Search query must be between 2 and 80 characters',
      );
    }

    const context = await this.getDiscoverablePostContext(userId);
    const normalizedTag = searchQuery.startsWith('#')
      ? normalizeHashtag(searchQuery)
      : '';
    const contentExpression = new RegExp(
      escapeRegularExpression(searchQuery),
      'i',
    );
    const searchFilter = normalizedTag
      ? {
          $or: [{ hashtags: normalizedTag }, { content: contentExpression }],
        }
      : { content: contentExpression };

    return this.findRankedDiscoveryPosts(
      { $and: [context.filter, searchFilter] },
      context,
      userId,
      parseDiscoveryLimit(query.limit, 20),
      searchQuery,
    );
  }

  async findTrendingTopics(userId: string, requestedLimit?: string) {
    const limit = Math.min(parseDiscoveryLimit(requestedLimit, 8), 12);
    const context = await this.getDiscoverablePostContext(userId);
    const createdAt = {
      $gte: new Date(Date.now() - trendingWindowDays * 24 * 60 * 60 * 1000),
    };
    const topics = await this.postModel
      .aggregate<{
        engagementCount: number;
        postCount: number;
        tag: string;
      }>([
        {
          $match: {
            ...context.filter,
            createdAt,
            hashtags: { $exists: true, $ne: [] },
          },
        },
        { $unwind: '$hashtags' },
        {
          $group: {
            _id: '$hashtags',
            engagementCount: {
              $sum: {
                $add: [
                  { $size: { $ifNull: ['$likedBy', []] } },
                  { $ifNull: ['$commentsCount', 0] },
                ],
              },
            },
            postCount: { $sum: 1 },
          },
        },
        { $sort: { postCount: -1, engagementCount: -1, _id: 1 } },
        { $limit: limit },
        {
          $project: {
            _id: 0,
            engagementCount: 1,
            postCount: 1,
            tag: '$_id',
          },
        },
      ])
      .exec();

    return topics.map((topic) => ({
      ...topic,
      id: topic.tag,
      tag: `#${topic.tag}`,
    }));
  }

  async findAll(
    userId?: string,
    query: FeedQuery = {},
  ): Promise<FeedPageResponse> {
    const limit = Math.min(Math.max(Number(query.limit) || 12, 1), 30);

    if (query.feed === 'recommended' && userId) {
      return this.findRecommendedFeed(userId, limit);
    }

    const visibility = userId
      ? await this.relationshipService.getViewerVisibility(userId)
      : null;
    const hiddenAuthorIds = visibility?.hiddenUserIds ?? new Set<string>();
    const feed = query.feed === 'following' ? 'following' : 'all';
    const sort =
      query.sort === 'trending' || query.sort === 'top' ? 'trending' : 'latest';
    const cursor =
      sort === 'latest' && query.cursor
        ? decodeLatestFeedCursor(query.cursor)
        : null;
    const queryLimit =
      sort === 'trending' ? limit * recentTrendingWindowMultiplier : limit + 1;
    const postQuery: Record<string, unknown> = userId
      ? { hiddenBy: { $ne: new Types.ObjectId(userId) } }
      : {};
    const hiddenAuthorObjectIds = [...hiddenAuthorIds]
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    const inaccessibleAuthorIds = await this.findInaccessibleAuthorIds(userId);
    const excludedAuthorIds = Array.from(
      new Map(
        [...hiddenAuthorObjectIds, ...inaccessibleAuthorIds].map((id) => [
          id.toString(),
          id,
        ]),
      ).values(),
    );
    const authorFilter: Record<string, Types.ObjectId[]> = {};

    if (cursor?.id) {
      postQuery.$or = [
        { createdAt: { $lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
      ];
    } else if (cursor) {
      postQuery.createdAt = { $lt: cursor.createdAt };
    }

    if (feed === 'following') {
      authorFilter.$in = visibility?.followingIds ?? [];
    }

    if (excludedAuthorIds.length > 0) {
      authorFilter.$nin = excludedAuthorIds;
    }

    if (Object.keys(authorFilter).length > 0) {
      postQuery.author = authorFilter;
    }

    const posts = await this.postModel
      .find(postQuery)
      .sort({ createdAt: -1, _id: -1 })
      .limit(queryLimit)
      .populate<{
        author: PopulatedAuthor;
      }>(
        'author',
        'username email avatarUrl followers isSuspended profileVisibility',
      )
      .populate<{
        comments: PopulatedComment[];
      }>(
        'comments.author',
        'username email followers isSuspended profileVisibility',
      )
      .populate(
        'comments.replies.author',
        'username email followers isSuspended profileVisibility',
      )
      .exec();

    const filteredPosts = mapPostDocumentsToFeedModels(posts).filter((post) => {
      const authorId = post.author?._id?.toString();
      return !authorId || !hiddenAuthorIds.has(authorId);
    });
    const sortedPosts =
      sort === 'trending'
        ? filteredPosts.sort(
            (a, b) =>
              this.postFeedMapper.scorePost(b) -
                this.postFeedMapper.scorePost(a) ||
              (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
          )
        : filteredPosts;
    const items = sortedPosts
      .slice(0, limit)
      .map((post) =>
        this.postFeedMapper.toFeedPost(post, userId, hiddenAuthorIds),
      );
    const hasMore = sort === 'latest' && sortedPosts.length > limit;
    const lastPost = hasMore ? sortedPosts[limit - 1] : null;

    return {
      hasMore,
      items,
      nextCursor: lastPost ? encodeLatestFeedCursor(lastPost) : null,
    };
  }

  async findById(
    postId: string,
    viewerId?: string,
  ): Promise<PublicPostResponse> {
    const visibility = await this.getPublicViewerContext(viewerId);
    const post = await this.findPublicPostOrThrow(postId, visibility);

    return this.postFeedMapper.toPublicPost(
      post,
      viewerId,
      visibility.hiddenAuthorIds,
    );
  }

  async findByAuthorUsername(
    username: string,
    viewerId?: string,
  ): Promise<PublicPostResponse[]> {
    const visibility = await this.getPublicViewerContext(viewerId);
    const author = await this.userModel
      .findOne({
        isSuspended: false,
        usernameLower: normalizeUsernameLower(username),
      })
      .select('_id followers isSuspended profileVisibility');

    if (!author || visibility.hiddenAuthorIds.has(author._id.toString())) {
      throw new NotFoundException('User not found');
    }

    if (!this.canViewUserContent(author, viewerId)) {
      return [];
    }

    const posts = await this.postModel
      .find({
        ...this.getPublicPostFilter(visibility.viewerObjectId),
        author: author._id,
      })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate<{
        author: PopulatedAuthor;
      }>(
        'author',
        'username email avatarUrl followers isSuspended profileVisibility',
      )
      .populate<{
        comments: PopulatedComment[];
      }>(
        'comments.author',
        'username email followers isSuspended profileVisibility',
      )
      .populate(
        'comments.replies.author',
        'username email followers isSuspended profileVisibility',
      )
      .exec();

    return mapPostDocumentsToFeedModels(posts).map((post) =>
      this.postFeedMapper.toPublicPost(
        post,
        viewerId,
        visibility.hiddenAuthorIds,
      ),
    );
  }

  async create(
    createPostDto: { content?: string; mediaUrls?: string[] },
    user: AuthUser,
  ): Promise<FeedPostResponse> {
    const content = createPostDto.content?.trim() ?? '';
    const mediaUrls = this.normalizeMediaUrls(createPostDto.mediaUrls);

    if (!content && mediaUrls.length === 0) {
      throw new BadRequestException('Post content or media is required');
    }

    if (content.length > 500) {
      throw new BadRequestException(
        'Post content must be 500 characters or less',
      );
    }

    const post = await this.postModel.create({
      content,
      author: new Types.ObjectId(user.id),
      mediaUrls,
    });

    const populatedPost = await post.populate([
      {
        path: 'author',
        select:
          'username email avatarUrl followers isSuspended profileVisibility',
      },
      {
        path: 'comments.author',
        select: 'username email followers isSuspended profileVisibility',
      },
      {
        path: 'comments.replies.author',
        select: 'username email followers isSuspended profileVisibility',
      },
    ]);

    await this.notificationsService.createMentions({
      actorId: user.id,
      content,
      postId: post._id.toString(),
    });

    return this.postFeedMapper.toFeedPost(
      mapPostDocumentToFeedModel(populatedPost),
      user.id,
    );
  }

  async setLike(
    postId: string,
    user: AuthUser,
    shouldLike: boolean,
  ): Promise<FeedPostResponse> {
    if (!Types.ObjectId.isValid(postId)) {
      throw new BadRequestException('Invalid post id');
    }

    await this.findAccessiblePostOrThrow(postId, user.id);

    const userObjectId = new Types.ObjectId(user.id);
    const postObjectId = new Types.ObjectId(postId);
    const updateResult = await this.postModel.updateOne(
      { _id: postObjectId },
      shouldLike
        ? { $addToSet: { likedBy: userObjectId } }
        : { $pull: { likedBy: userObjectId } },
    );

    if (updateResult.matchedCount === 0) {
      throw new NotFoundException('Post not found');
    }

    const post = await this.findPostOrThrow(postId);

    if (shouldLike && updateResult.modifiedCount > 0) {
      await this.notificationsService.create({
        actorId: user.id,
        postId,
        recipientId: post.author.toString(),
        type: 'like',
      });
    }

    const populatedPost = await post.populate<{ author: PopulatedAuthor }>(
      'author',
      'username email avatarUrl followers isSuspended profileVisibility',
    );

    return this.postFeedMapper.toFeedPost(
      mapPostDocumentToFeedModel(populatedPost),
      user.id,
    );
  }

  async update(
    postId: string,
    updatePostDto: { content?: string; mediaUrls?: string[] },
    user: AuthUser,
  ): Promise<FeedPostResponse> {
    if (!Types.ObjectId.isValid(postId)) {
      throw new BadRequestException('Invalid post id');
    }

    const post = await this.findPostOrThrow(postId);

    if (post.author.toString() !== user.id) {
      throw new ForbiddenException('You can only edit your own posts');
    }

    const hasContentUpdate = updatePostDto.content !== undefined;
    const hasMediaUpdate = updatePostDto.mediaUrls !== undefined;

    if (!hasContentUpdate && !hasMediaUpdate) {
      throw new BadRequestException('Post content or media is required');
    }

    const nextContent = hasContentUpdate
      ? (updatePostDto.content?.trim() ?? '')
      : post.content;
    const nextMediaUrls = hasMediaUpdate
      ? this.normalizeMediaUrls(updatePostDto.mediaUrls)
      : (post.mediaUrls ?? []);

    if (!nextContent && nextMediaUrls.length === 0) {
      throw new BadRequestException('Post content or media is required');
    }

    if (nextContent.length > 500) {
      throw new BadRequestException(
        'Post content must be 500 characters or less',
      );
    }

    if (hasContentUpdate) {
      post.content = nextContent;
    }
    if (hasMediaUpdate) {
      post.mediaUrls = nextMediaUrls;
    }
    await post.save();

    const populatedPost = await post.populate([
      {
        path: 'author',
        select:
          'username email avatarUrl followers isSuspended profileVisibility',
      },
      {
        path: 'comments.author',
        select: 'username email followers isSuspended profileVisibility',
      },
      {
        path: 'comments.replies.author',
        select: 'username email followers isSuspended profileVisibility',
      },
    ]);

    return this.postFeedMapper.toFeedPost(
      mapPostDocumentToFeedModel(populatedPost),
      user.id,
    );
  }

  async remove(postId: string, user: AuthUser) {
    if (!Types.ObjectId.isValid(postId)) {
      throw new BadRequestException('Invalid post id');
    }

    const post = await this.findPostOrThrow(postId);

    if (post.author.toString() !== user.id) {
      throw new ForbiddenException('You can only delete your own posts');
    }

    await post.deleteOne();
    await Promise.all([
      this.notificationsService.deleteForPost(postId),
      this.savedPostsService.removeDeletedPost(postId),
    ]);

    return { id: postId, ok: true };
  }

  async hidePost(postId: string, user: AuthUser) {
    if (!Types.ObjectId.isValid(postId)) {
      throw new BadRequestException('Invalid post id');
    }

    const result = await this.postModel.updateOne(
      { _id: postId },
      { $addToSet: { hiddenBy: new Types.ObjectId(user.id) } },
    );

    if (result.matchedCount === 0) {
      throw new NotFoundException('Post not found');
    }

    return { id: postId, hidden: true };
  }

  async report(
    createReportDto: {
      targetType: 'post' | 'comment' | 'user';
      targetId: string;
      reason: string;
      details?: string;
    },
    user: AuthUser,
  ) {
    return this.postReportsService.createReport(createReportDto, user.id);
  }

  async addComment(
    postId: string,
    createCommentDto: { content: string },
    user: AuthUser,
  ): Promise<FeedPostResponse> {
    if (!Types.ObjectId.isValid(postId)) {
      throw new BadRequestException('Invalid post id');
    }

    const content = createCommentDto.content?.trim();

    if (!content) {
      throw new BadRequestException('Comment content is required');
    }

    if (content.length > 280) {
      throw new BadRequestException(
        'Comment content must be 280 characters or less',
      );
    }

    const post = await this.findAccessiblePostOrThrow(postId, user.id);

    post.comments = post.comments ?? [];
    post.comments.push({
      _id: new Types.ObjectId(),
      author: new Types.ObjectId(user.id),
      content,
      hiddenBy: [],
      likedBy: [],
      replies: [],
    });
    post.commentsCount = this.countComments(post.comments);

    await post.save();

    await this.notificationsService.create({
      actorId: user.id,
      content,
      postId,
      recipientId: post.author.toString(),
      type: 'comment',
    });

    await this.notificationsService.createMentions({
      actorId: user.id,
      content,
      postId,
    });

    const populatedPost = await post.populate([
      {
        path: 'author',
        select:
          'username email avatarUrl followers isSuspended profileVisibility',
      },
      {
        path: 'comments.author',
        select: 'username email followers isSuspended profileVisibility',
      },
      {
        path: 'comments.replies.author',
        select: 'username email followers isSuspended profileVisibility',
      },
    ]);

    return this.postFeedMapper.toFeedPost(
      mapPostDocumentToFeedModel(populatedPost),
      user.id,
    );
  }

  async setCommentLike(
    postId: string,
    commentId: string,
    user: AuthUser,
    shouldLike: boolean,
  ): Promise<FeedPostResponse> {
    if (!Types.ObjectId.isValid(postId)) {
      throw new BadRequestException('Invalid post id');
    }

    if (!Types.ObjectId.isValid(commentId)) {
      throw new BadRequestException('Invalid comment id');
    }

    const accessiblePost = await this.findAccessiblePostOrThrow(
      postId,
      user.id,
    );
    const userObjectId = new Types.ObjectId(user.id);
    const commentObjectId = new Types.ObjectId(commentId);
    const updateResult = await this.postModel.updateOne(
      { _id: new Types.ObjectId(postId), 'comments._id': commentObjectId },
      shouldLike
        ? { $addToSet: { 'comments.$[comment].likedBy': userObjectId } }
        : { $pull: { 'comments.$[comment].likedBy': userObjectId } },
      { arrayFilters: [{ 'comment._id': commentObjectId }] },
    );

    if (updateResult.matchedCount === 0) {
      this.findCommentOrThrow(accessiblePost, commentId);
    }

    const post = await this.findPostOrThrow(postId);
    return this.populateAndMap(post, user.id);
  }

  async addReply(
    postId: string,
    commentId: string,
    createCommentDto: { content: string },
    user: AuthUser,
  ): Promise<FeedPostResponse> {
    const content = createCommentDto.content?.trim();

    if (!content) {
      throw new BadRequestException('Reply content is required');
    }

    if (content.length > 280) {
      throw new BadRequestException(
        'Reply content must be 280 characters or less',
      );
    }

    const post = await this.findAccessiblePostOrThrow(postId, user.id);
    const comment = this.findCommentOrThrow(post, commentId);
    comment.replies = comment.replies ?? [];
    comment.replies.push({
      _id: new Types.ObjectId(),
      author: new Types.ObjectId(user.id),
      content,
      hiddenBy: [],
      likedBy: [],
    });
    post.commentsCount = this.countComments(post.comments ?? []);

    await post.save();

    await this.notificationsService.create({
      actorId: user.id,
      content,
      postId,
      recipientId: post.author.toString(),
      type: 'comment',
    });

    await this.notificationsService.createMentions({
      actorId: user.id,
      content,
      postId,
    });

    return this.populateAndMap(post, user.id);
  }

  async setReplyLike(
    postId: string,
    commentId: string,
    replyId: string,
    user: AuthUser,
    shouldLike: boolean,
  ): Promise<FeedPostResponse> {
    if (!Types.ObjectId.isValid(postId)) {
      throw new BadRequestException('Invalid post id');
    }

    if (!Types.ObjectId.isValid(commentId)) {
      throw new BadRequestException('Invalid comment id');
    }

    if (!Types.ObjectId.isValid(replyId)) {
      throw new BadRequestException('Invalid reply id');
    }

    const accessiblePost = await this.findAccessiblePostOrThrow(
      postId,
      user.id,
    );
    const userObjectId = new Types.ObjectId(user.id);
    const commentObjectId = new Types.ObjectId(commentId);
    const replyObjectId = new Types.ObjectId(replyId);
    const updateResult = await this.postModel.updateOne(
      {
        _id: new Types.ObjectId(postId),
        comments: {
          $elemMatch: {
            _id: commentObjectId,
            'replies._id': replyObjectId,
          },
        },
      },
      shouldLike
        ? {
            $addToSet: {
              'comments.$[comment].replies.$[reply].likedBy': userObjectId,
            },
          }
        : {
            $pull: {
              'comments.$[comment].replies.$[reply].likedBy': userObjectId,
            },
          },
      {
        arrayFilters: [
          { 'comment._id': commentObjectId },
          { 'reply._id': replyObjectId },
        ],
      },
    );

    if (updateResult.matchedCount === 0) {
      const comment = this.findCommentOrThrow(accessiblePost, commentId);
      this.findReplyOrThrow(comment, replyId);
    }

    const post = await this.findPostOrThrow(postId);
    return this.populateAndMap(post, user.id);
  }

  private async findPostOrThrow(postId: string) {
    if (!Types.ObjectId.isValid(postId)) {
      throw new BadRequestException('Invalid post id');
    }

    const post = await this.postModel.findById(postId);

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    return post;
  }

  private async findAccessiblePostOrThrow(postId: string, viewerId: string) {
    const post = await this.findPostOrThrow(postId);
    const viewerObjectId = new Types.ObjectId(viewerId);

    if (
      post.isArchived ||
      post.isHidden ||
      (post.hiddenBy ?? []).some((id) => id.equals(viewerObjectId))
    ) {
      throw new NotFoundException('Post not found');
    }

    const author = await this.userModel.findById(post.author);
    const hiddenUserIds =
      await this.relationshipService.getHiddenUserIds(viewerId);

    if (
      !author ||
      !this.canViewUserContent(author, viewerId) ||
      hiddenUserIds.has(author._id.toString())
    ) {
      throw new NotFoundException('Post not found');
    }

    return post;
  }

  private async findPublicPostOrThrow(
    postId: string,
    visibility: PublicViewerContext,
  ): Promise<PostWithAuthor> {
    if (!Types.ObjectId.isValid(postId)) {
      throw new BadRequestException('Invalid post id');
    }

    const post = await this.postModel
      .findOne({
        _id: new Types.ObjectId(postId),
        ...this.getPublicPostFilter(visibility.viewerObjectId),
      })
      .populate<{ author: PopulatedAuthor }>(
        'author',
        'username email avatarUrl followers isSuspended profileVisibility',
      )
      .populate<{
        comments: PopulatedComment[];
      }>(
        'comments.author',
        'username email followers isSuspended profileVisibility',
      )
      .populate(
        'comments.replies.author',
        'username email followers isSuspended profileVisibility',
      )
      .exec();

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const feedPost = mapPostDocumentToFeedModel(post);
    const authorId = feedPost.author?._id?.toString();

    if (
      !feedPost.author ||
      !this.canViewUserContent(
        feedPost.author,
        visibility.viewerObjectId?.toString(),
      ) ||
      visibility.hiddenAuthorIds.has(authorId ?? '')
    ) {
      throw new NotFoundException('Post not found');
    }

    return feedPost;
  }

  private findCommentOrThrow(post: PostDocument, commentId: string) {
    const comment = post.comments?.find(
      (item) => item._id.toString() === commentId,
    );

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    return comment;
  }

  private findReplyOrThrow(
    comment: NonNullable<PostDocument['comments']>[number],
    replyId: string,
  ) {
    const reply = comment.replies?.find(
      (item) => item._id.toString() === replyId,
    );

    if (!reply) {
      throw new NotFoundException('Reply not found');
    }

    return reply;
  }

  private countComments(comments: NonNullable<PostDocument['comments']>) {
    return comments.reduce(
      (count, comment) => count + 1 + (comment.replies?.length ?? 0),
      0,
    );
  }

  private normalizeMediaUrls(mediaUrls?: string[]) {
    const publicApiUrl = this.configService.get<string>('PUBLIC_API_URL');
    const normalizedUrls = Array.from(
      new Set((mediaUrls ?? []).map((url) => url.trim()).filter(Boolean)),
    ).slice(0, 4);

    for (const url of normalizedUrls) {
      if (
        !isTrustedUploadUrl({
          directory: 'post-media',
          publicApiUrl,
          url,
        })
      ) {
        throw new BadRequestException(
          'Post media must reference an uploaded post image',
        );
      }
    }

    return normalizedUrls;
  }

  private async populateAndMap(post: PostDocument, userId?: string) {
    const populatedPost = await post.populate([
      {
        path: 'author',
        select:
          'username email avatarUrl followers isSuspended profileVisibility',
      },
      {
        path: 'comments.author',
        select: 'username email followers isSuspended profileVisibility',
      },
      {
        path: 'comments.replies.author',
        select: 'username email followers isSuspended profileVisibility',
      },
    ]);

    return this.postFeedMapper.toFeedPost(
      mapPostDocumentToFeedModel(populatedPost),
      userId,
    );
  }

  private async getDiscoverablePostContext(
    userId: string,
  ): Promise<DiscoverablePostContext> {
    const viewerObjectId = new Types.ObjectId(userId);
    const visibility = await this.relationshipService.getViewerVisibility(
      userId,
      { requireViewer: true },
    );
    const hiddenAuthorObjectIds = [...visibility.hiddenUserIds]
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    const inaccessibleAuthorIds = await this.findInaccessibleAuthorIds(userId);
    const excludedAuthorIds = Array.from(
      new Map(
        [...hiddenAuthorObjectIds, ...inaccessibleAuthorIds].map((id) => [
          id.toString(),
          id,
        ]),
      ).values(),
    );

    return {
      filter: {
        ...this.getPublicPostFilter(viewerObjectId),
        ...(excludedAuthorIds.length
          ? { author: { $nin: excludedAuthorIds } }
          : {}),
      },
      followingIds: visibility.followingIds ?? [],
      hiddenAuthorIds: visibility.hiddenUserIds,
    };
  }

  private async findRecommendedFeed(
    userId: string,
    limit: number,
  ): Promise<FeedPageResponse> {
    const viewerObjectId = new Types.ObjectId(userId);
    const context = await this.getDiscoverablePostContext(userId);
    const signalDocuments = await this.postModel
      .find({
        $or: [
          { author: viewerObjectId },
          { likedBy: viewerObjectId },
          { savedBy: viewerObjectId },
          { 'comments.author': viewerObjectId },
          { 'comments.replies.author': viewerObjectId },
        ],
        isArchived: { $ne: true },
        isHidden: { $ne: true },
      })
      .select(
        '_id author hashtags likedBy savedBy comments.author comments.replies.author',
      )
      .sort({ createdAt: -1, _id: -1 })
      .limit(100)
      .exec();
    const signals = signalDocuments.map((post) =>
      post.toObject<RecommendationSignal>({ depopulate: true }),
    );
    const profile = buildRecommendationProfile({
      followingIds: context.followingIds,
      signals,
      viewerId: userId,
    });
    const candidateFilter = {
      $and: [context.filter, { author: { $ne: viewerObjectId } }],
    };
    const candidates = await this.findPopulatedPostCandidates(
      candidateFilter,
      Math.min(limit * 10, maxDiscoveryCandidates),
    );
    const rankedPosts = rankRecommendedPosts(candidates, profile, limit);

    return {
      hasMore: false,
      items: rankedPosts.map((post) =>
        this.postFeedMapper.toFeedPost(post, userId, context.hiddenAuthorIds),
      ),
      nextCursor: null,
    };
  }

  private async findRankedDiscoveryPosts(
    filter: Record<string, unknown>,
    context: DiscoverablePostContext,
    userId: string,
    limit: number,
    searchQuery = '',
  ) {
    const posts = await this.findPopulatedPostCandidates(
      filter,
      Math.min(limit * discoveryCandidateMultiplier, maxDiscoveryCandidates),
    );
    const normalizedSearch = searchQuery.toLocaleLowerCase('en-US');

    return posts
      .filter((post) => Boolean(post.author))
      .sort((left, right) => {
        const score = (post: PostWithAuthor) => {
          const ageInHours = Math.max(
            0,
            (Date.now() - (post.createdAt?.getTime() ?? 0)) / 3_600_000,
          );
          const recencyScore = Math.max(0, 48 - ageInHours) / 8;
          const exactTopicBoost =
            normalizedSearch &&
            post.content.toLocaleLowerCase('en-US').includes(normalizedSearch)
              ? 10
              : 0;

          return (
            this.postFeedMapper.scorePost(post) + recencyScore + exactTopicBoost
          );
        };

        return (
          score(right) - score(left) ||
          (right.createdAt?.getTime() ?? 0) - (left.createdAt?.getTime() ?? 0)
        );
      })
      .slice(0, limit)
      .map((post) =>
        this.postFeedMapper.toFeedPost(post, userId, context.hiddenAuthorIds),
      );
  }

  private async findPopulatedPostCandidates(
    filter: Record<string, unknown>,
    candidateLimit: number,
  ) {
    const posts = await this.postModel
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(candidateLimit)
      .populate<{
        author: PopulatedAuthor;
      }>(
        'author',
        'username email avatarUrl followers isSuspended profileVisibility',
      )
      .populate<{
        comments: PopulatedComment[];
      }>(
        'comments.author',
        'username email followers isSuspended profileVisibility',
      )
      .populate(
        'comments.replies.author',
        'username email followers isSuspended profileVisibility',
      )
      .exec();

    return mapPostDocumentsToFeedModels(posts);
  }

  private async getPublicViewerContext(
    viewerId?: string,
  ): Promise<PublicViewerContext> {
    if (!viewerId) {
      return { hiddenAuthorIds: new Set<string>() };
    }

    const visibility =
      await this.relationshipService.getViewerVisibility(viewerId);

    return {
      hiddenAuthorIds: visibility.hiddenUserIds,
      viewerObjectId: new Types.ObjectId(viewerId),
    };
  }

  private getPublicPostFilter(viewerObjectId?: Types.ObjectId) {
    return {
      ...(viewerObjectId ? { hiddenBy: { $ne: viewerObjectId } } : {}),
      isArchived: { $ne: true },
      isHidden: { $ne: true },
    };
  }

  private canViewUserContent(
    author: {
      _id: Types.ObjectId;
      followers?: Types.ObjectId[];
      isSuspended?: boolean;
      profileVisibility?: 'public' | 'private';
    },
    viewerId?: string,
  ) {
    if (author.isSuspended) return false;
    if (author.profileVisibility !== 'private') return true;
    if (!viewerId) return false;

    return (
      author._id.toString() === viewerId ||
      (author.followers ?? []).some(
        (followerId) => followerId.toString() === viewerId,
      )
    );
  }

  private async findInaccessibleAuthorIds(viewerId?: string) {
    const viewerObjectId = viewerId ? new Types.ObjectId(viewerId) : undefined;
    const privateAuthorFilter: Record<string, unknown> = {
      profileVisibility: 'private',
    };

    if (viewerObjectId) {
      privateAuthorFilter._id = { $ne: viewerObjectId };
      privateAuthorFilter.followers = { $ne: viewerObjectId };
    }

    const authors = await this.userModel
      .find({
        $or: [{ isSuspended: true }, privateAuthorFilter],
      })
      .select('_id')
      .exec();

    return authors.map((author) => author._id);
  }
}
