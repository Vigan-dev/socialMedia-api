import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { User } from './schemas/user.schema';
import type { UserDocument } from './schemas/user.schema';

type ViewerVisibility = {
  blockedUserIds: Types.ObjectId[];
  followingIds: Types.ObjectId[];
  hiddenUserIds: Set<string>;
  mutedUserIds: Types.ObjectId[];
};

@Injectable()
export class RelationshipService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  toObjectId(id: string, label = 'user') {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid ${label} id`);
    }

    return new Types.ObjectId(id);
  }

  assertNotSelf(currentUserId: string, targetUserId: string, message: string) {
    if (currentUserId === targetUserId) {
      throw new BadRequestException(message);
    }
  }

  async assertUserExists(userId: string | Types.ObjectId) {
    const exists = await this.userModel.exists({ _id: userId });

    if (!exists) {
      throw new NotFoundException('User not found');
    }
  }

  async assertRelationshipTarget(
    currentUserId: string,
    targetUserId: string,
    selfMessage = 'You cannot target yourself',
    options: { requireCurrentUser?: boolean } = {},
  ) {
    const currentObjectId = this.toObjectId(currentUserId);
    const targetObjectId = this.toObjectId(targetUserId);
    this.assertNotSelf(currentUserId, targetUserId, selfMessage);

    if (options.requireCurrentUser) {
      const [currentExists, targetExists] = await Promise.all([
        this.userModel.exists({ _id: currentObjectId }),
        this.userModel.exists({ _id: targetObjectId }),
      ]);

      if (!currentExists || !targetExists) {
        throw new NotFoundException('User not found');
      }
    } else {
      await this.assertUserExists(targetObjectId);
    }

    return {
      currentObjectId,
      targetObjectId,
    };
  }

  async getHiddenUserIds(userId: string) {
    return (await this.getViewerVisibility(userId)).hiddenUserIds;
  }

  async getViewerVisibility(
    userId: string,
    options: { requireViewer?: boolean } = {},
  ): Promise<ViewerVisibility> {
    const viewerObjectId = this.toObjectId(userId);
    const user = await this.userModel
      .findById(viewerObjectId)
      .select('blockedUsers following mutedUsers')
      .exec();

    if (!user && options.requireViewer) {
      throw new NotFoundException('User not found');
    }

    const usersBlockingViewer = await this.userModel
      .find({ blockedUsers: viewerObjectId })
      .select('_id')
      .exec();

    const blockedUserIds = user?.blockedUsers ?? [];
    const mutedUserIds = user?.mutedUsers ?? [];

    return {
      blockedUserIds,
      followingIds: user?.following ?? [],
      hiddenUserIds: new Set([
        ...blockedUserIds.map((id) => id.toString()),
        ...mutedUserIds.map((id) => id.toString()),
        ...usersBlockingViewer.map((blockingUser) => String(blockingUser._id)),
      ]),
      mutedUserIds,
    };
  }
}
