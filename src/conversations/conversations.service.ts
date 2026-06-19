import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { NotificationsService } from '../notifications/notifications.service';
import { User } from '../users/schemas/user.schema';
import type { UserDocument } from '../users/schemas/user.schema';
import { Conversation } from './schemas/conversation.schema';
import type { ConversationDocument } from './schemas/conversation.schema';
import { Message } from './schemas/message.schema';
import type { MessageDocument } from './schemas/message.schema';
import type {
  ConversationResponse,
  MessageResponse,
} from './dto/conversation-response.dto';
import {
  mapConversationDocumentToResponse,
  mapMessageDocumentToResponse,
} from './conversation-response.mapper';

const TYPING_TTL_MS = 6000;

@Injectable()
export class ConversationsService {
  constructor(
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async findForUser(userId: string): Promise<ConversationResponse[]> {
    const conversations = await this.conversationModel
      .find({ participants: new Types.ObjectId(userId) })
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .populate([
        {
          path: 'participants',
          select: 'username avatarUrl status showOnlineStatus',
        },
        {
          path: 'typing.user',
          select: 'username',
        },
      ])
      .exec();

    return conversations.map((conversation) =>
      mapConversationDocumentToResponse(conversation, userId),
    );
  }

  async findOrCreate(
    userId: string,
    participantId: string,
  ): Promise<ConversationResponse> {
    if (!Types.ObjectId.isValid(participantId)) {
      throw new BadRequestException('Invalid participant id');
    }

    if (userId === participantId) {
      throw new BadRequestException('You cannot message yourself');
    }

    const targetUser = await this.userModel.findById(participantId);

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    if (targetUser.privacy?.allowMessagesFrom === 'none') {
      throw new ForbiddenException('This user is not accepting messages');
    }

    if (
      targetUser.privacy?.allowMessagesFrom === 'following' &&
      !targetUser.following?.some((id) => id.toString() === userId)
    ) {
      throw new ForbiddenException('Only followed users can message this user');
    }

    const participantIds = [
      new Types.ObjectId(userId),
      new Types.ObjectId(participantId),
    ];

    let conversation = await this.conversationModel.findOne({
      participants: { $all: participantIds, $size: 2 },
    });

    if (!conversation) {
      conversation = await this.conversationModel.create({
        participants: participantIds,
        unreadCounts: new Map(),
      });
    }

    const populated = await conversation.populate([
      {
        path: 'participants',
        select: 'username avatarUrl status showOnlineStatus',
      },
      {
        path: 'typing.user',
        select: 'username',
      },
    ]);

    return mapConversationDocumentToResponse(populated, userId);
  }

  async findMessages(
    userId: string,
    conversationId: string,
  ): Promise<MessageResponse[]> {
    await this.assertParticipant(userId, conversationId);

    const messages = await this.messageModel
      .find({ conversation: new Types.ObjectId(conversationId) })
      .sort({ createdAt: 1 })
      .populate('sender', 'username avatarUrl')
      .exec();

    return messages.map((message) =>
      mapMessageDocumentToResponse(message, userId),
    );
  }

  async sendMessage(
    userId: string,
    conversationId: string,
    body: string,
  ): Promise<MessageResponse> {
    const content = body?.trim();

    if (!content) {
      throw new BadRequestException('Message body is required');
    }

    const conversation = await this.assertParticipant(userId, conversationId);
    const senderObjectId = new Types.ObjectId(userId);
    const recipientIds = conversation.participants.filter(
      (participantId) => participantId.toString() !== userId,
    );

    const message = await this.messageModel.create({
      body: content,
      conversation: new Types.ObjectId(conversationId),
      deliveredTo: recipientIds,
      readBy: [{ user: senderObjectId, readAt: new Date() }],
      sender: senderObjectId,
    });

    const unreadIncrements = recipientIds.reduce<Record<string, number>>(
      (increments, recipientId) => {
        increments[`unreadCounts.${recipientId.toString()}`] = 1;
        return increments;
      },
      {},
    );

    await this.conversationModel.updateOne(
      { _id: conversation._id },
      {
        ...(Object.keys(unreadIncrements).length
          ? { $inc: unreadIncrements }
          : {}),
        $pull: { typing: { user: senderObjectId } },
        $set: {
          lastMessage: content,
          lastMessageAt: new Date(),
        },
      },
    );

    await Promise.allSettled(
      recipientIds.map((recipientId) =>
        this.notificationsService.create({
          actorId: userId,
          content,
          recipientId: recipientId.toString(),
          type: 'message',
        }),
      ),
    );

    const populated = await message.populate('sender', 'username avatarUrl');

    return mapMessageDocumentToResponse(populated, userId);
  }

  async markRead(
    userId: string,
    conversationId: string,
  ): Promise<ConversationResponse> {
    const conversation = await this.assertParticipant(userId, conversationId);
    const userObjectId = new Types.ObjectId(userId);

    await this.messageModel.updateMany(
      {
        conversation: new Types.ObjectId(conversationId),
        sender: { $ne: userObjectId },
        'readBy.user': { $ne: userObjectId },
      },
      { $push: { readBy: { user: userObjectId, readAt: new Date() } } },
    );

    await this.conversationModel.updateOne(
      { _id: conversation._id },
      { $set: { [`unreadCounts.${userId}`]: 0 } },
    );

    const updatedConversation = await this.conversationModel.findById(
      conversation._id,
    );

    if (!updatedConversation) {
      throw new NotFoundException('Conversation not found');
    }

    const populated = await updatedConversation.populate([
      {
        path: 'participants',
        select: 'username avatarUrl status showOnlineStatus',
      },
      {
        path: 'typing.user',
        select: 'username',
      },
    ]);

    return mapConversationDocumentToResponse(populated, userId);
  }

  async updateTyping(
    userId: string,
    conversationId: string,
    isTyping: boolean,
  ): Promise<ConversationResponse> {
    const conversation = await this.assertParticipant(userId, conversationId);
    const userObjectId = new Types.ObjectId(userId);
    const now = new Date();

    await Promise.all([
      this.conversationModel.updateOne(
        { _id: conversation._id },
        { $pull: { typing: { expiresAt: { $lte: now } } } },
      ),
      this.conversationModel.updateOne(
        { _id: conversation._id },
        { $pull: { typing: { user: userObjectId } } },
      ),
    ]);

    if (isTyping) {
      await this.conversationModel.updateOne(
        { _id: conversation._id },
        {
          $addToSet: {
            typing: {
              expiresAt: new Date(now.getTime() + TYPING_TTL_MS),
              user: userObjectId,
            },
          },
        },
      );
    }

    const updatedConversation = await this.conversationModel.findById(
      conversation._id,
    );

    if (!updatedConversation) {
      throw new NotFoundException('Conversation not found');
    }

    const populated = await updatedConversation.populate([
      {
        path: 'participants',
        select: 'username avatarUrl status showOnlineStatus',
      },
      {
        path: 'typing.user',
        select: 'username',
      },
    ]);

    return mapConversationDocumentToResponse(populated, userId);
  }

  private async assertParticipant(userId: string, conversationId: string) {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new BadRequestException('Invalid conversation id');
    }

    const conversation = await this.conversationModel.findById(conversationId);

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const isParticipant = conversation.participants.some(
      (participantId) => participantId.toString() === userId,
    );

    if (!isParticipant) {
      throw new ForbiddenException('You are not part of this conversation');
    }

    return conversation;
  }
}
