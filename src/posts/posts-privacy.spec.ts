import { Types } from 'mongoose';

import { PostsService } from './posts.service';

describe('PostsService private profile access', () => {
  it('does not query posts when an anonymous viewer opens a private profile', async () => {
    const author = {
      _id: new Types.ObjectId(),
      followers: [],
      isSuspended: false,
      profileVisibility: 'private' as const,
    };
    const authorQuery = {
      select: jest.fn().mockResolvedValue(author),
    };
    const postModel = {
      find: jest.fn(),
    };
    const userModel = {
      findOne: jest.fn().mockReturnValue(authorQuery),
    };
    const service = new PostsService(
      postModel as never,
      userModel as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.findByAuthorUsername('PrivateUser')).resolves.toEqual(
      [],
    );

    expect(authorQuery.select).toHaveBeenCalledWith(
      '_id followers isSuspended profileVisibility',
    );
    expect(postModel.find).not.toHaveBeenCalled();
  });
});
