import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RelationshipService } from '../users/relationship.service';
import { User } from '../users/schemas/user.schema';
import type { UserDocument } from '../users/schemas/user.schema';
import type { SavedCollectionResponse } from './dto/saved-post-response.dto';
import { mapPostDocumentsToFeedModels } from './post-document.mapper';
import { PostFeedMapper } from './post-feed.mapper';
import type { PopulatedAuthor, PopulatedComment } from './post-feed.types';
import { Post } from './schemas/post.schema';
import type { PostDocument } from './schemas/post.schema';
import { SavedCollection } from './schemas/saved-collection.schema';
import type { SavedCollectionDocument } from './schemas/saved-collection.schema';

@Injectable()
export class SavedPostsService {
  constructor(
    @InjectModel(Post.name)
    private readonly postModel: Model<PostDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(SavedCollection.name)
    private readonly collectionModel: Model<SavedCollectionDocument>,
    private readonly relationshipService: RelationshipService,
    private readonly postFeedMapper: PostFeedMapper,
  ) {}

  async findSavedPosts(userId: string, collectionId?: string) {
    const userObjectId = new Types.ObjectId(userId);
    const hiddenUserIds =
      await this.relationshipService.getHiddenUserIds(userId);
    const inaccessibleAuthorIds = await this.findInaccessibleAuthorIds(userId);
    const excludedAuthorIds = Array.from(
      new Map(
        [
          ...inaccessibleAuthorIds,
          ...[...hiddenUserIds]
            .filter((id) => Types.ObjectId.isValid(id))
            .map((id) => new Types.ObjectId(id)),
        ].map((id) => [id.toString(), id]),
      ).values(),
    );
    const filter: Record<string, unknown> = {
      hiddenBy: { $ne: userObjectId },
      isArchived: { $ne: true },
      isHidden: { $ne: true },
      savedBy: userObjectId,
    };

    if (excludedAuthorIds.length > 0) {
      filter.author = { $nin: excludedAuthorIds };
    }

    if (collectionId) {
      const collection = await this.findOwnedCollection(userId, collectionId);
      filter._id = { $in: collection.posts ?? [] };
    }

    const posts = await this.postModel
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(100)
      .populate<{
        author: PopulatedAuthor;
      }>(
        'author',
        'username email avatarUrl followers isSuspended profileVisibility',
      )
      .populate(
        'repostOf',
        'author content createdAt hiddenBy hashtags isArchived isHidden mediaUrls',
      )
      .populate(
        'repostOf.author',
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
      this.postFeedMapper.toFeedPost(post, userId, hiddenUserIds),
    );
  }

  async setSaved(postId: string, userId: string, shouldSave: boolean) {
    const postObjectId = this.toObjectId(postId, 'Invalid post id');
    const userObjectId = new Types.ObjectId(userId);

    if (shouldSave) {
      await this.assertPostAccessible(postId, userId);
    }

    const result = await this.postModel.updateOne(
      { _id: postObjectId },
      shouldSave
        ? { $addToSet: { savedBy: userObjectId } }
        : { $pull: { savedBy: userObjectId } },
    );

    if (result.matchedCount === 0) {
      throw new NotFoundException('Post not found');
    }

    if (!shouldSave) {
      await this.collectionModel.updateMany(
        { owner: userObjectId },
        { $pull: { posts: postObjectId } },
      );
    }

    return { id: postId, isSaved: shouldSave };
  }

  async removeDeletedPost(postId: string) {
    const postObjectId = this.toObjectId(postId, 'Invalid post id');
    await this.collectionModel.updateMany(
      { posts: postObjectId },
      { $pull: { posts: postObjectId } },
    );
  }

  async findCollections(userId: string): Promise<SavedCollectionResponse[]> {
    const collections = await this.collectionModel
      .find({ owner: new Types.ObjectId(userId) })
      .sort({ createdAt: -1, _id: -1 })
      .exec();

    return collections.map((collection) =>
      this.toCollectionResponse(collection),
    );
  }

  async createCollection(userId: string, rawName: string) {
    const name = this.normalizeDisplayName(rawName);

    try {
      const collection = await this.collectionModel.create({
        name,
        normalizedName: name.toLowerCase(),
        owner: new Types.ObjectId(userId),
        posts: [],
      });

      return this.toCollectionResponse(collection);
    } catch (error) {
      this.throwCollectionWriteError(error);
    }
  }

  async renameCollection(
    userId: string,
    collectionId: string,
    rawName: string,
  ) {
    const name = this.normalizeDisplayName(rawName);
    const collectionObjectId = this.toObjectId(
      collectionId,
      'Invalid collection id',
    );

    try {
      const collection = await this.collectionModel.findOneAndUpdate(
        { _id: collectionObjectId, owner: new Types.ObjectId(userId) },
        { name, normalizedName: name.toLowerCase() },
        { returnDocument: 'after', runValidators: true },
      );

      if (!collection) {
        throw new NotFoundException('Collection not found');
      }

      return this.toCollectionResponse(collection);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.throwCollectionWriteError(error);
    }
  }

  async deleteCollection(userId: string, collectionId: string) {
    const result = await this.collectionModel.deleteOne({
      _id: this.toObjectId(collectionId, 'Invalid collection id'),
      owner: new Types.ObjectId(userId),
    });

    if (result.deletedCount === 0) {
      throw new NotFoundException('Collection not found');
    }

    return { id: collectionId, ok: true };
  }

  async addPostToCollection(
    userId: string,
    collectionId: string,
    postId: string,
  ) {
    const collection = await this.findOwnedCollection(userId, collectionId);
    await this.assertPostAccessible(postId, userId);

    const userObjectId = new Types.ObjectId(userId);
    const postObjectId = this.toObjectId(postId, 'Invalid post id');
    const postUpdate = await this.postModel.updateOne(
      { _id: postObjectId },
      { $addToSet: { savedBy: userObjectId } },
    );

    if (postUpdate.matchedCount === 0) {
      throw new NotFoundException('Post not found');
    }

    const updatedCollection = await this.collectionModel.findOneAndUpdate(
      { _id: collection._id, owner: userObjectId },
      { $addToSet: { posts: postObjectId } },
      { returnDocument: 'after' },
    );

    if (!updatedCollection) {
      throw new NotFoundException('Collection not found');
    }

    return this.toCollectionResponse(updatedCollection);
  }

  async removePostFromCollection(
    userId: string,
    collectionId: string,
    postId: string,
  ) {
    const postObjectId = this.toObjectId(postId, 'Invalid post id');
    const collection = await this.collectionModel.findOneAndUpdate(
      {
        _id: this.toObjectId(collectionId, 'Invalid collection id'),
        owner: new Types.ObjectId(userId),
      },
      { $pull: { posts: postObjectId } },
      { returnDocument: 'after' },
    );

    if (!collection) {
      throw new NotFoundException('Collection not found');
    }

    return this.toCollectionResponse(collection);
  }

  private async assertPostAccessible(postId: string, userId: string) {
    const post = await this.postModel.findById(
      this.toObjectId(postId, 'Invalid post id'),
    );
    const viewerObjectId = new Types.ObjectId(userId);

    if (
      !post ||
      post.isArchived ||
      post.isHidden ||
      (post.hiddenBy ?? []).some((id) => id.equals(viewerObjectId))
    ) {
      throw new NotFoundException('Post not found');
    }

    const author = await this.userModel.findById(post.author);
    const hiddenUserIds =
      await this.relationshipService.getHiddenUserIds(userId);
    const canViewPrivatePost =
      author?.profileVisibility !== 'private' ||
      author?._id.toString() === userId ||
      (author?.followers ?? []).some(
        (followerId) => followerId.toString() === userId,
      );

    if (
      !author ||
      author.isSuspended ||
      !canViewPrivatePost ||
      hiddenUserIds.has(author._id.toString())
    ) {
      throw new NotFoundException('Post not found');
    }
  }

  private async findInaccessibleAuthorIds(userId: string) {
    const viewerObjectId = new Types.ObjectId(userId);
    const authors = await this.userModel
      .find({
        $or: [
          { isSuspended: true },
          {
            _id: { $ne: viewerObjectId },
            followers: { $ne: viewerObjectId },
            profileVisibility: 'private',
          },
        ],
      })
      .select('_id')
      .exec();

    return authors.map((author) => author._id);
  }

  private async findOwnedCollection(userId: string, collectionId: string) {
    const collection = await this.collectionModel.findOne({
      _id: this.toObjectId(collectionId, 'Invalid collection id'),
      owner: new Types.ObjectId(userId),
    });

    if (!collection) {
      throw new NotFoundException('Collection not found');
    }

    return collection;
  }

  private normalizeDisplayName(rawName: string) {
    const name = rawName.trim().replace(/\s+/g, ' ');

    if (!name) {
      throw new BadRequestException('Collection name is required');
    }

    return name;
  }

  private toCollectionResponse(
    collection: SavedCollectionDocument,
  ): SavedCollectionResponse {
    const postIds = (collection.posts ?? []).map((postId) => postId.toString());

    return {
      id: collection._id.toString(),
      name: collection.name,
      postCount: postIds.length,
      postIds,
    };
  }

  private toObjectId(value: string, message: string) {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(message);
    }

    return new Types.ObjectId(value);
  }

  private throwCollectionWriteError(error: unknown): never {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 11000
    ) {
      throw new ConflictException('A collection with this name already exists');
    }

    throw error;
  }
}
