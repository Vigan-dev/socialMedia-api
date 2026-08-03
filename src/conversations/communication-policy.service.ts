import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { User } from '../users/schemas/user.schema';
import type { UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class CommunicationPolicyService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async assertCanMessage(senderId: string, recipientId: string): Promise<void> {
    if (
      !Types.ObjectId.isValid(senderId) ||
      !Types.ObjectId.isValid(recipientId)
    ) {
      throw new BadRequestException('Invalid user id');
    }

    if (senderId === recipientId) {
      throw new BadRequestException('You cannot message yourself');
    }

    const [sender, recipient] = await Promise.all([
      this.userModel.findById(senderId).select('blockedUsers').exec(),
      this.userModel
        .findById(recipientId)
        .select('blockedUsers following privacy.allowMessagesFrom')
        .exec(),
    ]);

    if (!sender || !recipient) {
      throw new NotFoundException('User not found');
    }

    const senderBlockedRecipient = this.includesUserId(
      sender.blockedUsers,
      recipientId,
    );
    const recipientBlockedSender = this.includesUserId(
      recipient.blockedUsers,
      senderId,
    );

    if (senderBlockedRecipient || recipientBlockedSender) {
      throw new ForbiddenException(
        'Messaging is not allowed between these users',
      );
    }

    if (recipient.privacy?.allowMessagesFrom === 'none') {
      throw new ForbiddenException('This user is not accepting messages');
    }

    if (
      recipient.privacy?.allowMessagesFrom === 'following' &&
      !this.includesUserId(recipient.following, senderId)
    ) {
      throw new ForbiddenException('Only followed users can message this user');
    }
  }

  private includesUserId(
    userIds: Types.ObjectId[] | undefined,
    userId: string,
  ): boolean {
    return userIds?.some((id) => id.toString() === userId) ?? false;
  }
}
