import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

import { PostsService } from './posts.service';

describe('PostsService desired like state', () => {
  const postId = new Types.ObjectId().toString();
  const authorId = new Types.ObjectId();
  const userId = new Types.ObjectId().toString();
  const commentId = new Types.ObjectId().toString();
  const replyId = new Types.ObjectId().toString();
  let service: PostsService;
  let postModel: {
    findById: jest.Mock;
    updateOne: jest.Mock;
  };
  let notificationsService: { create: jest.Mock };
  let relationshipService: { getHiddenUserIds: jest.Mock };
  let userModel: { findById: jest.Mock };
  let authorDocument: {
    _id: Types.ObjectId;
    followers: Types.ObjectId[];
    isSuspended: boolean;
    profileVisibility: 'public' | 'private';
  };
  let postDocument: {
    author: Types.ObjectId;
    populate: jest.Mock;
    toObject: jest.Mock;
  };

  beforeEach(() => {
    postDocument = {
      author: authorId,
      populate: jest.fn(),
      toObject: jest.fn(() => ({
        _id: new Types.ObjectId(postId),
        author: {
          _id: authorId,
          avatarUrl: '',
          email: 'author@example.com',
          followers: [],
          username: 'Author',
        },
        comments: [],
        commentsCount: 0,
        content: 'Post',
        hiddenBy: [],
        likedBy: [new Types.ObjectId(userId)],
        mediaUrls: [],
      })),
    };
    postDocument.populate.mockResolvedValue(postDocument);
    postModel = {
      findById: jest.fn().mockResolvedValue(postDocument),
      updateOne: jest.fn(),
    };
    notificationsService = { create: jest.fn() };
    authorDocument = {
      _id: authorId,
      followers: [],
      isSuspended: false,
      profileVisibility: 'public',
    };
    userModel = { findById: jest.fn().mockResolvedValue(authorDocument) };
    relationshipService = {
      getHiddenUserIds: jest.fn().mockResolvedValue(new Set<string>()),
    };

    service = new PostsService(
      postModel as never,
      userModel as never,
      notificationsService as never,
      relationshipService as never,
      {
        toFeedPost: jest.fn(() => ({
          id: postId,
          isLiked: true,
          likes: 1,
        })),
      } as never,
      {} as never,
      { get: jest.fn() } as never,
      {} as never,
      {} as never,
    );
  });

  it('rejects engagement with a private post from a non-follower', async () => {
    authorDocument.profileVisibility = 'private';

    await expect(
      service.setLike(postId, { id: userId }, true),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(postModel.updateOne).not.toHaveBeenCalled();
  });

  it('keeps repeated like requests idempotent and notifies once', async () => {
    postModel.updateOne
      .mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 })
      .mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 0 });

    await service.setLike(postId, { id: userId }, true);
    await service.setLike(postId, { id: userId }, true);

    expect(postModel.updateOne).toHaveBeenCalledTimes(2);
    expect(postModel.updateOne).toHaveBeenCalledWith(
      { _id: new Types.ObjectId(postId) },
      { $addToSet: { likedBy: new Types.ObjectId(userId) } },
    );
    expect(notificationsService.create).toHaveBeenCalledTimes(1);
  });

  it('uses an idempotent pull when the desired state is unliked', async () => {
    postModel.updateOne.mockResolvedValue({
      matchedCount: 1,
      modifiedCount: 0,
    });

    await service.setLike(postId, { id: userId }, false);
    await service.setLike(postId, { id: userId }, false);

    expect(postModel.updateOne).toHaveBeenCalledWith(
      { _id: new Types.ObjectId(postId) },
      { $pull: { likedBy: new Types.ObjectId(userId) } },
    );
    expect(notificationsService.create).not.toHaveBeenCalled();
  });

  it('updates a comment like atomically with an array filter', async () => {
    postModel.updateOne.mockResolvedValue({
      matchedCount: 1,
      modifiedCount: 1,
    });

    await service.setCommentLike(postId, commentId, { id: userId }, true);

    expect(postModel.updateOne).toHaveBeenCalledWith(
      {
        _id: new Types.ObjectId(postId),
        'comments._id': new Types.ObjectId(commentId),
      },
      {
        $addToSet: {
          'comments.$[comment].likedBy': new Types.ObjectId(userId),
        },
      },
      { arrayFilters: [{ 'comment._id': new Types.ObjectId(commentId) }] },
    );
  });

  it('updates a reply unlike atomically with nested array filters', async () => {
    postModel.updateOne.mockResolvedValue({
      matchedCount: 1,
      modifiedCount: 1,
    });

    await service.setReplyLike(
      postId,
      commentId,
      replyId,
      { id: userId },
      false,
    );

    expect(postModel.updateOne).toHaveBeenCalledWith(
      {
        _id: new Types.ObjectId(postId),
        comments: {
          $elemMatch: {
            _id: new Types.ObjectId(commentId),
            'replies._id': new Types.ObjectId(replyId),
          },
        },
      },
      {
        $pull: {
          'comments.$[comment].replies.$[reply].likedBy': new Types.ObjectId(
            userId,
          ),
        },
      },
      {
        arrayFilters: [
          { 'comment._id': new Types.ObjectId(commentId) },
          { 'reply._id': new Types.ObjectId(replyId) },
        ],
      },
    );
  });
});
