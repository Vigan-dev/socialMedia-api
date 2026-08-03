import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';

import { CommunicationPolicyService } from './communication-policy.service';

describe('CommunicationPolicyService', () => {
  let service: CommunicationPolicyService;
  let userModel: { findById: jest.Mock };

  const senderId = new Types.ObjectId();
  const recipientId = new Types.ObjectId();

  function queryResult<T>(value: T) {
    return {
      exec: jest.fn().mockResolvedValue(value),
      select: jest.fn().mockReturnThis(),
    };
  }

  function mockUsers({
    recipientBlockedUsers = [],
    recipientFollowing = [],
    recipientPrivacy = 'everyone',
    senderBlockedUsers = [],
  }: {
    recipientBlockedUsers?: Types.ObjectId[];
    recipientFollowing?: Types.ObjectId[];
    recipientPrivacy?: 'everyone' | 'following' | 'none';
    senderBlockedUsers?: Types.ObjectId[];
  } = {}) {
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
          following: recipientFollowing,
          privacy: { allowMessagesFrom: recipientPrivacy },
        },
      ],
    ]);

    userModel.findById.mockImplementation((id: string | Types.ObjectId) =>
      queryResult(users.get(id.toString()) ?? null),
    );
  }

  beforeEach(() => {
    userModel = { findById: jest.fn() };
    service = new CommunicationPolicyService(userModel as never);
  });

  it.each([
    ['the sender blocked the recipient', [recipientId], []],
    ['the recipient blocked the sender', [], [senderId]],
  ])(
    'rejects messaging when %s',
    async (_description, senderBlockedUsers, recipientBlockedUsers) => {
      mockUsers({ senderBlockedUsers, recipientBlockedUsers });

      await expect(
        service.assertCanMessage(senderId.toString(), recipientId.toString()),
      ).rejects.toThrow(
        new ForbiddenException('Messaging is not allowed between these users'),
      );
    },
  );

  it('enforces a recipient privacy setting of none', async () => {
    mockUsers({ recipientPrivacy: 'none' });

    await expect(
      service.assertCanMessage(senderId.toString(), recipientId.toString()),
    ).rejects.toThrow(
      new ForbiddenException('This user is not accepting messages'),
    );
  });

  it('allows messaging under following privacy only when the recipient follows the sender', async () => {
    mockUsers({ recipientPrivacy: 'following' });

    await expect(
      service.assertCanMessage(senderId.toString(), recipientId.toString()),
    ).rejects.toThrow(
      new ForbiddenException('Only followed users can message this user'),
    );

    mockUsers({
      recipientFollowing: [senderId],
      recipientPrivacy: 'following',
    });

    await expect(
      service.assertCanMessage(senderId.toString(), recipientId.toString()),
    ).resolves.toBeUndefined();
  });

  it('rejects invalid, self, and missing users', async () => {
    await expect(
      service.assertCanMessage('invalid-id', recipientId.toString()),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.assertCanMessage(senderId.toString(), senderId.toString()),
    ).rejects.toBeInstanceOf(BadRequestException);

    userModel.findById.mockReturnValue(queryResult(null));

    await expect(
      service.assertCanMessage(senderId.toString(), recipientId.toString()),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
