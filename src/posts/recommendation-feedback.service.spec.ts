import { Types } from 'mongoose';
import { RecommendationFeedbackService } from './recommendation-feedback.service';

describe('RecommendationFeedbackService', () => {
  it('upserts one feedback signal per user and post', async () => {
    const userId = new Types.ObjectId();
    const postId = new Types.ObjectId();
    const authorId = new Types.ObjectId();
    const feedbackModel = { updateOne: jest.fn().mockResolvedValue({}) };
    const service = new RecommendationFeedbackService(
      feedbackModel as never,
      {} as never,
    );

    await expect(
      service.recordPostFeedback(
        userId.toString(),
        {
          _id: postId,
          author: authorId,
          hashtags: ['nestjs'],
        } as never,
        'show_fewer',
      ),
    ).resolves.toEqual({ action: 'show_fewer', postId: postId.toString() });

    expect(feedbackModel.updateOne).toHaveBeenCalledWith(
      { post: postId, user: userId },
      {
        $set: {
          action: 'show_fewer',
          author: authorId,
          topics: ['nestjs'],
        },
        $setOnInsert: { post: postId, user: userId },
      },
      { runValidators: true, upsert: true },
    );
  });

  it('normalizes and deduplicates muted topics', async () => {
    const userId = new Types.ObjectId();
    const userQuery = {
      exec: jest.fn().mockResolvedValue({ _id: userId, mutedTopics: [] }),
      select: jest.fn().mockReturnThis(),
    };
    const updatedUserQuery = {
      exec: jest
        .fn()
        .mockResolvedValue({ _id: userId, mutedTopics: ['typescript'] }),
      select: jest.fn().mockReturnThis(),
    };
    const userModel = {
      findById: jest
        .fn()
        .mockReturnValueOnce(userQuery)
        .mockReturnValueOnce(updatedUserQuery),
      updateOne: jest.fn().mockResolvedValue({}),
    };
    const service = new RecommendationFeedbackService(
      {} as never,
      userModel as never,
    );

    await expect(
      service.muteTopic(userId.toString(), '#TypeScript'),
    ).resolves.toEqual({ mutedTopics: ['typescript'] });
    expect(userModel.updateOne).toHaveBeenCalledWith(
      { _id: userId },
      { $addToSet: { mutedTopics: 'typescript' } },
    );
  });
});
