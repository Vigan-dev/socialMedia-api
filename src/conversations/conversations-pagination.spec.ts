import { Types } from 'mongoose';

import { encodeCursor } from '../common/pagination/cursor-pagination';
import { ConversationsService } from './conversations.service';

describe('ConversationsService pagination', () => {
  let conversationModel: { find: jest.Mock; findById: jest.Mock };
  let messageModel: { find: jest.Mock };
  let messageQuery: {
    exec: jest.Mock;
    limit: jest.Mock;
    populate: jest.Mock;
    sort: jest.Mock;
  };
  let service: ConversationsService;

  beforeEach(() => {
    const conversationQuery = {
      exec: jest.fn().mockResolvedValue([]),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
    };
    messageQuery = {
      exec: jest.fn().mockResolvedValue([]),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
    };
    conversationModel = {
      find: jest.fn().mockReturnValue(conversationQuery),
      findById: jest.fn(),
    };
    messageModel = { find: jest.fn().mockReturnValue(messageQuery) };
    service = new ConversationsService(
      conversationModel as never,
      messageModel as never,
      {} as never,
      {} as never,
    );
  });

  it('loads direct messages newest-first with a compound older cursor', async () => {
    const conversationId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const otherUserId = new Types.ObjectId();
    const boundaryId = new Types.ObjectId();
    const boundaryDate = new Date('2026-08-03T12:00:00.000Z');
    const cursor = encodeCursor('conversation-messages', {
      id: boundaryId.toString(),
      sortValue: boundaryDate.toISOString(),
    });
    conversationModel.findById.mockResolvedValue({
      participants: [userId, otherUserId],
    });

    await service.findMessages(userId.toString(), conversationId.toString(), {
      cursor,
      limit: '20',
    });

    expect(messageModel.find).toHaveBeenCalledWith({
      conversation: conversationId,
      $or: [
        { createdAt: { $lt: boundaryDate } },
        { createdAt: boundaryDate, _id: { $lt: boundaryId } },
      ],
    });
    expect(messageQuery.sort).toHaveBeenCalledWith({
      createdAt: -1,
      _id: -1,
    });
    expect(messageQuery.limit).toHaveBeenCalledWith(21);
  });
});
