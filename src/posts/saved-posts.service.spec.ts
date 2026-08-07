import { ConflictException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

import { SavedPostsService } from './saved-posts.service';

describe('SavedPostsService', () => {
  const authorId = new Types.ObjectId();
  const postId = new Types.ObjectId();
  const userId = new Types.ObjectId();
  let collectionModel: {
    create: jest.Mock;
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
    updateMany: jest.Mock;
  };
  let postModel: {
    findById: jest.Mock;
    updateOne: jest.Mock;
  };
  let relationshipService: { getHiddenUserIds: jest.Mock };
  let service: SavedPostsService;
  let userModel: { findById: jest.Mock };

  beforeEach(() => {
    postModel = {
      findById: jest.fn().mockResolvedValue({
        author: authorId,
        hiddenBy: [],
        isArchived: false,
        isHidden: false,
      }),
      updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
    };
    userModel = {
      findById: jest.fn().mockResolvedValue({
        _id: authorId,
        followers: [],
        isSuspended: false,
        profileVisibility: 'public',
      }),
    };
    collectionModel = {
      create: jest.fn(),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      updateMany: jest.fn(),
    };
    relationshipService = {
      getHiddenUserIds: jest.fn().mockResolvedValue(new Set<string>()),
    };
    service = new SavedPostsService(
      postModel as never,
      userModel as never,
      collectionModel as never,
      relationshipService as never,
      {} as never,
    );
  });

  it('saves an accessible post idempotently', async () => {
    await expect(
      service.setSaved(postId.toString(), userId.toString(), true),
    ).resolves.toEqual({ id: postId.toString(), isSaved: true });

    expect(postModel.updateOne).toHaveBeenCalledWith(
      { _id: postId },
      { $addToSet: { savedBy: userId } },
    );
  });

  it('rejects saving a private post for a non-follower', async () => {
    userModel.findById.mockResolvedValue({
      _id: authorId,
      followers: [],
      isSuspended: false,
      profileVisibility: 'private',
    });

    await expect(
      service.setSaved(postId.toString(), userId.toString(), true),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(postModel.updateOne).not.toHaveBeenCalled();
  });

  it('removes an unsaved post from every owned collection', async () => {
    await service.setSaved(postId.toString(), userId.toString(), false);

    expect(collectionModel.updateMany).toHaveBeenCalledWith(
      { owner: userId },
      { $pull: { posts: postId } },
    );
  });

  it('adds an accessible post to an owner-scoped collection and saves it', async () => {
    const collectionId = new Types.ObjectId();
    const collection = {
      _id: collectionId,
      name: 'Recipes',
      owner: userId,
      posts: [],
    };
    collectionModel.findOne.mockResolvedValue(collection);
    collectionModel.findOneAndUpdate.mockResolvedValue({
      ...collection,
      posts: [postId],
    });

    await expect(
      service.addPostToCollection(
        userId.toString(),
        collectionId.toString(),
        postId.toString(),
      ),
    ).resolves.toEqual({
      id: collectionId.toString(),
      name: 'Recipes',
      postCount: 1,
      postIds: [postId.toString()],
    });

    expect(collectionModel.findOne).toHaveBeenCalledWith({
      _id: collectionId,
      owner: userId,
    });
    expect(postModel.updateOne).toHaveBeenCalledWith(
      { _id: postId },
      { $addToSet: { savedBy: userId } },
    );
    expect(collectionModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: collectionId, owner: userId },
      { $addToSet: { posts: postId } },
      { returnDocument: 'after' },
    );
  });

  it('normalizes collection names before enforcing per-owner uniqueness', async () => {
    const collectionId = new Types.ObjectId();
    collectionModel.create.mockResolvedValue({
      _id: collectionId,
      name: 'My Ideas',
      owner: userId,
      posts: [],
    });

    await service.createCollection(userId.toString(), '  My   Ideas  ');

    expect(collectionModel.create).toHaveBeenCalledWith({
      name: 'My Ideas',
      normalizedName: 'my ideas',
      owner: userId,
      posts: [],
    });
  });

  it('returns a conflict for a duplicate collection name', async () => {
    collectionModel.create.mockRejectedValue({ code: 11000 });

    await expect(
      service.createCollection(userId.toString(), 'Ideas'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not add posts to a collection owned by another user', async () => {
    collectionModel.findOne.mockResolvedValue(null);

    await expect(
      service.addPostToCollection(
        userId.toString(),
        new Types.ObjectId().toString(),
        postId.toString(),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(postModel.updateOne).not.toHaveBeenCalled();
  });
});
