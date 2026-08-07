import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';

import { CommunicationPolicyService } from './communication-policy.service';
import { ConversationsService } from './conversations.service';

describe('ConversationsService communication policy integration', () => {
  let conversationModel: {
    findById: jest.Mock;
    findOneAndUpdate: jest.Mock;
    updateOne: jest.Mock;
  };
  let messageModel: { create: jest.Mock };
  let notificationsService: { create: jest.Mock };
  let service: ConversationsService;
  let userModel: { findById: jest.Mock };

  const conversationId = new Types.ObjectId();
  const recipientId = new Types.ObjectId();
  const senderId = new Types.ObjectId();

  function queryResult<T>(value: T) {
    return {
      exec: jest.fn().mockResolvedValue(value),
      select: jest.fn().mockReturnThis(),
    };
  }

  function mockUsers({
    recipientBlockedUsers = [],
    recipientPrivacy = 'everyone',
    senderBlockedUsers = [],
  }: {
    recipientBlockedUsers?: Types.ObjectId[];
    recipientPrivacy?: 'everyone' | 'following' | 'none';
    senderBlockedUsers?: Types.ObjectId[];
  }) {
    const users = new Map([
      [
        senderId.toString(),
        {
          _id: senderId,
          blockedUsers: senderBlockedUsers,
          following: [],
          privacy: { allowMessagesFrom: 'everyone' },
        },
      ],
      [
        recipientId.toString(),
        {
          _id: recipientId,
          blockedUsers: recipientBlockedUsers,
          following: [],
          privacy: { allowMessagesFrom: recipientPrivacy },
        },
      ],
    ]);

    userModel.findById.mockImplementation((id: string | Types.ObjectId) =>
      queryResult(users.get(id.toString()) ?? null),
    );
  }

  beforeEach(() => {
    conversationModel = {
      findById: jest.fn().mockResolvedValue({
        _id: conversationId,
        participants: [senderId, recipientId],
      }),
      findOneAndUpdate: jest.fn(),
      updateOne: jest.fn(),
    };
    messageModel = { create: jest.fn() };
    notificationsService = { create: jest.fn() };
    userModel = { findById: jest.fn() };

    const communicationPolicyService = new CommunicationPolicyService(
      userModel as never,
    );

    service = new ConversationsService(
      conversationModel as never,
      messageModel as never,
      communicationPolicyService,
      notificationsService as never,
      {} as never,
    );
  });

  it('prevents creating a conversation when either user has blocked the other', async () => {
    mockUsers({ recipientBlockedUsers: [senderId] });

    await expect(
      service.findOrCreate(senderId.toString(), recipientId.toString()),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(conversationModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ['sender blocked recipient', [recipientId], []],
    ['recipient blocked sender', [], [senderId]],
  ])(
    'prevents sending through an existing thread when the %s',
    async (_description, senderBlockedUsers, recipientBlockedUsers) => {
      mockUsers({ senderBlockedUsers, recipientBlockedUsers });

      await expect(
        service.sendMessage(
          senderId.toString(),
          conversationId.toString(),
          'This must not be stored',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(messageModel.create).not.toHaveBeenCalled();
      expect(conversationModel.updateOne).not.toHaveBeenCalled();
      expect(notificationsService.create).not.toHaveBeenCalled();
    },
  );

  it('rechecks message privacy before sending through an existing thread', async () => {
    mockUsers({ recipientPrivacy: 'none' });

    await expect(
      service.sendMessage(
        senderId.toString(),
        conversationId.toString(),
        'This must not be stored',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(messageModel.create).not.toHaveBeenCalled();
  });
});
