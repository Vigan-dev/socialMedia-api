import { Types } from 'mongoose';

import { encodeCursor } from '../common/pagination/cursor-pagination';
import { AiService } from './ai.service';

describe('AiService support session pagination', () => {
  it('paginates materialized sessions by last activity and id', async () => {
    const boundaryId = new Types.ObjectId();
    const boundaryDate = new Date('2026-08-03T12:00:00.000Z');
    const sessionQuery = {
      exec: jest.fn().mockResolvedValue([]),
      lean: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
    };
    const conversationModel = {
      exists: jest.fn().mockResolvedValue(true),
      find: jest.fn().mockReturnValue(sessionQuery),
    };
    const service = new AiService(
      {} as never,
      {} as never,
      conversationModel as never,
    );
    const cursor = encodeCursor('support-sessions', {
      id: boundaryId.toString(),
      sortValue: boundaryDate.toISOString(),
    });

    await service.getSessions('user-id', { cursor, limit: '10' });

    expect(conversationModel.find).toHaveBeenCalledWith({
      userId: 'user-id',
      $or: [
        { lastMessageAt: { $lt: boundaryDate } },
        { lastMessageAt: boundaryDate, _id: { $lt: boundaryId } },
      ],
    });
    expect(sessionQuery.sort).toHaveBeenCalledWith({
      lastMessageAt: -1,
      _id: -1,
    });
    expect(sessionQuery.limit).toHaveBeenCalledWith(11);
  });
});
