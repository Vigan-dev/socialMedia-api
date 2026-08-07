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

type LatestFeedCursor = {
  createdAt: Date;
  id?: Types.ObjectId;
};

type PublicViewerContext = {
  hiddenAuthorIds: Set<string>;
  viewerObjectId?: Types.ObjectId;
};

const recentTrendingWindowMultiplier = 3;

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

  async findAll(
    userId?: string,
    query: FeedQuery = {},
  ): Promise<FeedPageResponse> {
    const visibility = userId
      ? await this.relationshipService.getViewerVisibility(userId)
      : null;
    const hiddenAuthorIds = visibility?.hiddenUserIds ?? new Set<string>();
    const feed = query.feed === 'following' ? 'following' : 'all';
    const sort =
      query.sort === 'trending' || query.sort === 'top' ? 'trending' : 'latest';
    const limit = Math.min(Math.max(Number(query.limit) || 12, 1), 30);
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
