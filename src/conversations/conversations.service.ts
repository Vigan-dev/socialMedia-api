import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { NotificationsService } from '../notifications/notifications.service';
import { CommunicationPolicyService } from './communication-policy.service';
import {
  Conversation,
  createConversationKey,
} from './schemas/conversation.schema';
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
import {
  buildCursorPage,
  decodeCursor,
  encodeCursor,
  parsePageLimit,
} from '../common/pagination/cursor-pagination';
import { RealtimePublisher } from '../realtime/realtime.publisher';

const TYPING_TTL_MS = 6000;

type ConversationPageQuery = {
  cursor?: string;
  limit?: string;
};

function isDuplicateKeyError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    private readonly communicationPolicyService: CommunicationPolicyService,
    private readonly notificationsService: NotificationsService,
    private readonly realtimePublisher: RealtimePublisher,
  ) {}

  async findForUser(userId: string, query: ConversationPageQuery = {}) {
    const limit = parsePageLimit(query.limit, 30, 50);
    const cursor = this.decodeDateCursor('conversations', query.cursor);
    const conversationFilter: Record<string, unknown> = {
      participants: new Types.ObjectId(userId),
    };

    if (cursor) {
      conversationFilter.$or = [
        { updatedAt: { $lt: cursor.date } },
        { updatedAt: cursor.date, _id: { $lt: cursor.id } },
      ];
    }

    const conversations = await this.conversationModel
      .find(conversationFilter)
      .sort({ updatedAt: -1, _id: -1 })
      .limit(limit + 1)
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
    const page = buildCursorPage(conversations, limit, (conversation) =>
      encodeCursor('conversations', {
        id: conversation._id.toString(),
        sortValue: conversation.updatedAt.toISOString(),
      }),
    );

    return {
      ...page,
      items: page.items.map((conversation) =>
        mapConversationDocumentToResponse(conversation, userId),
      ),
    };
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

    await this.communicationPolicyService.assertCanMessage(
      userId,
      participantId,
    );

    const participantIds = [
      new Types.ObjectId(userId),
      new Types.ObjectId(participantId),
    ];
    const conversationKey = createConversationKey(participantIds);

    let conversation: ConversationDocument | null;

    try {
      conversation = await this.conversationModel.findOneAndUpdate(
        {
          $or: [
            { conversationKey },
            { participants: { $all: participantIds, $size: 2 } },
          ],
        },
        {
          $set: { conversationKey },
          $setOnInsert: {
            participants: participantIds,
            unreadCounts: new Map(),
          },
        },
        {
          new: true,
          setDefaultsOnInsert: true,
          upsert: true,
        },
      );
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      conversation = await this.conversationModel.findOne({ conversationKey });
    }

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
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

    this.publishConversation(populated, participantIds);

    return mapConversationDocumentToResponse(populated, userId);
  }

  async findMessages(
    userId: string,
    conversationId: string,
    query: ConversationPageQuery = {},
  ) {
    await this.assertParticipant(userId, conversationId);
    const limit = parsePageLimit(query.limit, 30, 50);
    const cursor = this.decodeDateCursor('conversation-messages', query.cursor);
    const messageFilter: Record<string, unknown> = {
      conversation: new Types.ObjectId(conversationId),
    };

    if (cursor) {
      messageFilter.$or = [
        { createdAt: { $lt: cursor.date } },
        { createdAt: cursor.date, _id: { $lt: cursor.id } },
      ];
    }

    const messages = await this.messageModel
      .find(messageFilter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .populate('sender', 'username avatarUrl')
      .exec();
    const page = buildCursorPage(messages, limit, (message) =>
      encodeCursor('conversation-messages', {
        id: message._id.toString(),
        sortValue: message.createdAt.toISOString(),
      }),
    );

    return {
      ...page,
      items: page.items.map((message) =>
        mapMessageDocumentToResponse(message, userId),
      ),
    };
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

    await Promise.all(
      recipientIds.map((recipientId) =>
        this.communicationPolicyService.assertCanMessage(
          userId,
          recipientId.toString(),
        ),
      ),
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

    try {
      const updatedConversation = await this.findPopulatedConversation(
        conversation._id,
      );
      this.publishConversation(updatedConversation, conversation.participants);

      for (const participantId of conversation.participants) {
        const participantUserId = participantId.toString();
        this.realtimePublisher.publishMessage(participantUserId, {
          conversationId,
          message: mapMessageDocumentToResponse(populated, participantUserId),
        });
      }
    } catch (error) {
      this.logger.warn(
        `Message ${message._id.toString()} was stored but realtime delivery failed`,
        error instanceof Error ? error.stack : undefined,
      );
    }

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

    this.publishConversation(populated, conversation.participants);
    for (const participantId of conversation.participants) {
      const participantUserId = participantId.toString();
      if (participantUserId !== userId) {
        this.realtimePublisher.publishMessageRead(participantUserId, {
          conversationId,
        });
      }
    }

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

    this.publishConversation(populated, conversation.participants);

    return mapConversationDocumentToResponse(populated, userId);
  }

  private decodeDateCursor(scope: string, cursor?: string) {
    const boundary = decodeCursor(scope, cursor);

    if (!boundary) {
      return null;
    }

    const date = new Date(boundary.sortValue);

    if (Number.isNaN(date.getTime()) || !Types.ObjectId.isValid(boundary.id)) {
      throw new BadRequestException('Invalid pagination cursor');
    }

    return { date, id: new Types.ObjectId(boundary.id) };
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

  private async findPopulatedConversation(conversationId: Types.ObjectId) {
    const conversation = await this.conversationModel.findById(conversationId);

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return conversation.populate([
      {
        path: 'participants',
        select: 'username avatarUrl status showOnlineStatus',
      },
      {
        path: 'typing.user',
        select: 'username',
      },
    ]);
  }

  private publishConversation(
    conversation: ConversationDocument,
    participantIds: Types.ObjectId[],
  ) {
    for (const participantId of participantIds) {
      const userId = participantId.toString();
      this.realtimePublisher.publishConversation(
        userId,
        mapConversationDocumentToResponse(conversation, userId),
      );
    }
  }
}
