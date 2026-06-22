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
import { RelationshipService } from '../users/relationship.service';
import { PostFeedMapper } from './post-feed.mapper';
import { PostReportsService } from './post-reports.service';
import {
  mapPostDocumentToFeedModel,
  mapPostDocumentsToFeedModels,
} from './post-document.mapper';
import type { PopulatedAuthor, PopulatedComment } from './post-feed.types';
import { isTrustedUploadUrl } from '../uploads/upload-url.validation';

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

const recentTrendingWindowMultiplier = 3;

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
      query.sort === 'trending' || query.sort === 'top'
        ? 'trending'
        : 'latest';
    const limit = Math.min(Math.max(Number(query.limit) || 12, 1), 30);
    const cursorDate =
      sort === 'latest' && query.cursor ? new Date(query.cursor) : null;
    const queryLimit =
      sort === 'trending' ? limit * recentTrendingWindowMultiplier : limit + 1;
    const postQuery: Record<string, unknown> = userId
      ? { hiddenBy: { $ne: new Types.ObjectId(userId) } }
      : {};

    if (cursorDate && !Number.isNaN(cursorDate.getTime())) {
      postQuery.createdAt = { $lt: cursorDate };
    }

    if (feed === 'following') {
      postQuery.author = { $in: visibility?.followingIds ?? [] };
    }

    const posts = await this.postModel
      .find(postQuery)
      .sort({ createdAt: -1 })
      .limit(queryLimit)
      .populate<{
        author: PopulatedAuthor;
      }>('author', 'username email avatarUrl followers')
      .populate<{
        comments: PopulatedComment[];
      }>('comments.author', 'username email')
      .populate('comments.replies.author', 'username email')
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
      nextCursor: lastPost?.createdAt?.toISOString() ?? null,
    };
  }

  async findById(postId: string): Promise<FeedPostResponse> {
    const post = await this.findPostOrThrow(postId);

    return this.populateAndMap(post);
  }

  async findByAuthorUsername(username: string): Promise<FeedPostResponse[]> {
    const author = await this.userModel
      .findOne({
        username: new RegExp(`^${this.escapeRegex(username.trim())}$`, 'i'),
      })
      .select('_id');

    if (!author) {
      throw new NotFoundException('User not found');
    }

    const posts = await this.postModel
      .find({ author: author._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate<{
        author: PopulatedAuthor;
      }>('author', 'username email avatarUrl followers')
      .populate<{
        comments: PopulatedComment[];
      }>('comments.author', 'username email')
      .populate('comments.replies.author', 'username email')
      .exec();

    return mapPostDocumentsToFeedModels(posts).map((post) =>
      this.postFeedMapper.toFeedPost(post),
    );
  }

  async create(
    createPostDto: { content: string; mediaUrls?: string[] },
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
      { path: 'author', select: 'username email avatarUrl followers' },
      { path: 'comments.author', select: 'username email' },
      { path: 'comments.replies.author', select: 'username email' },
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

  async toggleLike(postId: string, user: AuthUser): Promise<FeedPostResponse> {
    if (!Types.ObjectId.isValid(postId)) {
      throw new BadRequestException('Invalid post id');
    }

    const userObjectId = new Types.ObjectId(user.id);
    const postObjectId = new Types.ObjectId(postId);
    const unlikeResult = await this.postModel.updateOne(
      { _id: postObjectId, likedBy: userObjectId },
      { $pull: { likedBy: userObjectId } },
    );

    if (unlikeResult.matchedCount === 0) {
      const likeResult = await this.postModel.updateOne(
        { _id: postObjectId },
        { $addToSet: { likedBy: userObjectId } },
      );

      if (likeResult.matchedCount === 0) {
        throw new NotFoundException('Post not found');
      }
    }

    const post = await this.postModel.findById(postId);

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (unlikeResult.matchedCount === 0) {
      await this.notificationsService.create({
        actorId: user.id,
        postId,
        recipientId: post.author.toString(),
        type: 'like',
      });
    }

    const populatedPost = await post.populate<{ author: PopulatedAuthor }>(
      'author',
      'username email avatarUrl followers',
    );

    return this.postFeedMapper.toFeedPost(
      mapPostDocumentToFeedModel(populatedPost),
      user.id,
    );
  }

  async update(
    postId: string,
    updatePostDto: { content: string; mediaUrls?: string[] },
    user: AuthUser,
  ): Promise<FeedPostResponse> {
    if (!Types.ObjectId.isValid(postId)) {
      throw new BadRequestException('Invalid post id');
    }

    const content = updatePostDto.content?.trim() ?? '';
    const mediaUrls = this.normalizeMediaUrls(updatePostDto.mediaUrls);

    if (!content && mediaUrls.length === 0) {
      throw new BadRequestException('Post content or media is required');
    }

    if (content.length > 500) {
      throw new BadRequestException(
        'Post content must be 500 characters or less',
      );
    }

    const post = await this.postModel.findById(postId);

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (post.author.toString() !== user.id) {
      throw new ForbiddenException('You can only edit your own posts');
    }

    post.content = content;
    if (updatePostDto.mediaUrls) {
      post.mediaUrls = mediaUrls;
    }
    await post.save();

    const populatedPost = await post.populate([
      { path: 'author', select: 'username email avatarUrl followers' },
      { path: 'comments.author', select: 'username email' },
      { path: 'comments.replies.author', select: 'username email' },
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

    const post = await this.postModel.findById(postId);

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (post.author.toString() !== user.id) {
      throw new ForbiddenException('You can only delete your own posts');
    }

    await post.deleteOne();
    await this.notificationsService.deleteForPost(postId);

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

    const post = await this.postModel.findById(postId);

    if (!post) {
      throw new NotFoundException('Post not found');
    }

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
      { path: 'author', select: 'username email avatarUrl followers' },
      { path: 'comments.author', select: 'username email' },
      { path: 'comments.replies.author', select: 'username email' },
    ]);

    return this.postFeedMapper.toFeedPost(
      mapPostDocumentToFeedModel(populatedPost),
      user.id,
    );
  }

  async toggleCommentLike(
    postId: string,
    commentId: string,
    user: AuthUser,
  ): Promise<FeedPostResponse> {
    const post = await this.findPostOrThrow(postId);
    const comment = this.findCommentOrThrow(post, commentId);
    const userObjectId = new Types.ObjectId(user.id);
    comment.likedBy = comment.likedBy ?? [];

    const hasLiked = comment.likedBy.some((id) => id.equals(userObjectId));
    comment.likedBy = hasLiked
      ? comment.likedBy.filter((id) => !id.equals(userObjectId))
      : [...comment.likedBy, userObjectId];

    await post.save();

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

    const post = await this.findPostOrThrow(postId);
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

  async toggleReplyLike(
    postId: string,
    commentId: string,
    replyId: string,
    user: AuthUser,
  ): Promise<FeedPostResponse> {
    const post = await this.findPostOrThrow(postId);
    const comment = this.findCommentOrThrow(post, commentId);
    const reply = this.findReplyOrThrow(comment, replyId);
    const userObjectId = new Types.ObjectId(user.id);
    reply.likedBy = reply.likedBy ?? [];

    const hasLiked = reply.likedBy.some((id) => id.equals(userObjectId));
    reply.likedBy = hasLiked
      ? reply.likedBy.filter((id) => !id.equals(userObjectId))
      : [...reply.likedBy, userObjectId];

    await post.save();

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

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async populateAndMap(post: PostDocument, userId?: string) {
    const populatedPost = await post.populate([
      { path: 'author', select: 'username email avatarUrl followers' },
      { path: 'comments.author', select: 'username email' },
      { path: 'comments.replies.author', select: 'username email' },
    ]);

    return this.postFeedMapper.toFeedPost(
      mapPostDocumentToFeedModel(populatedPost),
      userId,
    );
  }
}
