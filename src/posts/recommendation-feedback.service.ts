import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from '../users/schemas/user.schema';
import type { UserDocument } from '../users/schemas/user.schema';
import { isValidHashtag, normalizeHashtag } from './post-hashtags';
import type { RecommendationFeedbackSignal } from './post-recommendation';
import type { PostDocument } from './schemas/post.schema';
import {
  RecommendationFeedback,
  type RecommendationFeedbackAction,
  type RecommendationFeedbackDocument,
} from './schemas/recommendation-feedback.schema';

const MAX_MUTED_TOPICS = 100;
const MAX_FEEDBACK_SIGNALS = 500;

@Injectable()
export class RecommendationFeedbackService {
  constructor(
    @InjectModel(RecommendationFeedback.name)
    private readonly feedbackModel: Model<RecommendationFeedbackDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async recordPostFeedback(
    userId: string,
    post: PostDocument,
    action: RecommendationFeedbackAction,
  ) {
    const userObjectId = new Types.ObjectId(userId);

    await this.feedbackModel.updateOne(
      { post: post._id, user: userObjectId },
      {
        $set: {
          action,
          author: post.author,
          topics: post.hashtags ?? [],
        },
        $setOnInsert: {
          post: post._id,
          user: userObjectId,
        },
      },
      { runValidators: true, upsert: true },
    );

    return {
      action,
      postId: post._id.toString(),
    };
  }

  async removePostFeedback(userId: string, postId: string) {
    if (!Types.ObjectId.isValid(postId)) {
      throw new BadRequestException('Invalid post id');
    }

    await this.feedbackModel.deleteOne({
      post: new Types.ObjectId(postId),
      user: new Types.ObjectId(userId),
    });

    return { postId, removed: true };
  }

  async getRecommendationSignals(userId: string): Promise<{
    feedback: RecommendationFeedbackSignal[];
    mutedTopics: string[];
  }> {
    const userObjectId = new Types.ObjectId(userId);
    const [user, feedback] = await Promise.all([
      this.userModel.findById(userObjectId).select('mutedTopics').exec(),
      this.feedbackModel
        .find({ user: userObjectId })
        .select('action author post topics')
        .sort({ createdAt: -1 })
        .limit(MAX_FEEDBACK_SIGNALS)
        .exec(),
    ]);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      feedback: feedback.map((item) => ({
        action: item.action,
        author: item.author,
        post: item.post,
        topics: item.topics ?? [],
      })),
      mutedTopics: user.mutedTopics ?? [],
    };
  }

  async getPreferences(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select('mutedTopics')
      .exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return { mutedTopics: [...(user.mutedTopics ?? [])].sort() };
  }

  async muteTopic(userId: string, requestedTopic: string) {
    const topic = this.validateTopic(requestedTopic);
    const user = await this.userModel
      .findById(userId)
      .select('mutedTopics')
      .exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!(user.mutedTopics ?? []).includes(topic)) {
      if ((user.mutedTopics ?? []).length >= MAX_MUTED_TOPICS) {
        throw new BadRequestException(
          `You can mute up to ${MAX_MUTED_TOPICS} topics`,
        );
      }

      await this.userModel.updateOne(
        { _id: user._id },
        { $addToSet: { mutedTopics: topic } },
      );
    }

    return this.getPreferences(userId);
  }

  async unmuteTopic(userId: string, requestedTopic: string) {
    const topic = this.validateTopic(requestedTopic);

    await this.userModel.updateOne(
      { _id: new Types.ObjectId(userId) },
      { $pull: { mutedTopics: topic } },
    );

    return this.getPreferences(userId);
  }

  private validateTopic(requestedTopic: string) {
    const topic = normalizeHashtag(requestedTopic);

    if (!isValidHashtag(topic)) {
      throw new BadRequestException('A valid topic is required');
    }

    return topic;
  }
}
