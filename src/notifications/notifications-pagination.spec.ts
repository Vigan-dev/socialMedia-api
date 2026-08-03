import { Types } from 'mongoose';

import { encodeCursor } from '../common/pagination/cursor-pagination';
import { NotificationsService } from './notifications.service';

describe('NotificationsService pagination', () => {
  it('uses a compound newest-first cursor scoped to the recipient', async () => {
    const recipientId = new Types.ObjectId();
    const boundaryId = new Types.ObjectId();
    const boundaryDate = new Date('2026-08-03T12:00:00.000Z');
    const query = {
      exec: jest.fn().mockResolvedValue([]),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
    };
    const notificationModel = {
      find: jest.fn().mockReturnValue(query),
    };
    const service = new NotificationsService(
      notificationModel as never,
      {} as never,
    );
    const cursor = encodeCursor('notifications', {
      id: boundaryId.toString(),
      sortValue: boundaryDate.toISOString(),
    });

    await service.findForUser(recipientId.toString(), {
      cursor,
      limit: '15',
    });

    expect(notificationModel.find).toHaveBeenCalledWith({
      recipient: recipientId,
      $or: [
        { createdAt: { $lt: boundaryDate } },
        { createdAt: boundaryDate, _id: { $lt: boundaryId } },
      ],
    });
    expect(query.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
    expect(query.limit).toHaveBeenCalledWith(16);
  });
});
