import { Types } from 'mongoose';
import { ConversationsService } from './conversations.service';

describe('ConversationsService realtime delivery', () => {
  it('publishes personalized message and thread updates to both participants', async () => {
    const conversationId = new Types.ObjectId();
    const messageId = new Types.ObjectId();
    const recipientId = new Types.ObjectId();
    const senderId = new Types.ObjectId();
    const createdAt = new Date('2026-08-07T10:00:00.000Z');
    const storedConversation = {
      _id: conversationId,
      participants: [senderId, recipientId],
    };
    const populatedConversation = {
      populate: jest.fn(),
      toObject: jest.fn(() => ({
        _id: conversationId,
        lastMessage: 'Hello',
        lastMessageAt: createdAt,
        participants: [
          {
            _id: senderId,
            avatarUrl: null,
            status: 'available',
            username: 'Sender',
          },
          {
            _id: recipientId,
            avatarUrl: null,
            status: 'available',
            username: 'Recipient',
          },
        ],
        typing: [],
        unreadCounts: new Map([[recipientId.toString(), 1]]),
        updatedAt: createdAt,
      })),
    };
    populatedConversation.populate.mockResolvedValue(populatedConversation);
    const message = {
      populate: jest.fn(),
      toObject: jest.fn(() => ({
        _id: messageId,
        body: 'Hello',
        createdAt,
        deliveredTo: [recipientId],
        readBy: [{ user: senderId, readAt: createdAt }],
        sender: {
          _id: senderId,
          avatarUrl: null,
          username: 'Sender',
        },
      })),
    };
    message.populate.mockResolvedValue(message);
    const conversationModel = {
      findById: jest
        .fn()
        .mockResolvedValueOnce(storedConversation)
        .mockResolvedValueOnce(populatedConversation),
      updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
    };
    const messageModel = { create: jest.fn().mockResolvedValue(message) };
    const communicationPolicyService = { assertCanMessage: jest.fn() };
    const notificationsService = { create: jest.fn() };
    const realtimePublisher = {
      publishConversation: jest.fn(),
      publishMessage: jest.fn(),
    };
    const service = new ConversationsService(
      conversationModel as never,
      messageModel as never,
      communicationPolicyService as never,
      notificationsService as never,
      realtimePublisher as never,
    );

    await service.sendMessage(
      senderId.toString(),
      conversationId.toString(),
      'Hello',
    );

    expect(realtimePublisher.publishMessage).toHaveBeenCalledTimes(2);
    expect(realtimePublisher.publishMessage).toHaveBeenCalledWith(
      senderId.toString(),
      {
        conversationId: conversationId.toString(),
        message: {
          delivered: true,
          id: messageId.toString(),
          isOwn: true,
          read: false,
          sender: {
            avatarUrl: null,
            id: senderId.toString(),
            name: 'Sender',
          },
          text: 'Hello',
          time: createdAt.toISOString(),
        },
      },
    );
    expect(realtimePublisher.publishMessage).toHaveBeenCalledWith(
      recipientId.toString(),
      {
        conversationId: conversationId.toString(),
        message: {
          delivered: true,
          id: messageId.toString(),
          isOwn: false,
          read: false,
          sender: {
            avatarUrl: null,
            id: senderId.toString(),
            name: 'Sender',
          },
          text: 'Hello',
          time: createdAt.toISOString(),
        },
      },
    );
    expect(realtimePublisher.publishConversation).toHaveBeenCalledTimes(2);
  });
});
