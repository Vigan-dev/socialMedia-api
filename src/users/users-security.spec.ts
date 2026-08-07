import { UsersService } from './users.service';

describe('UsersService account security persistence', () => {
  const createService = () => {
    const userModel = {
      updateOne: jest
        .fn<Promise<unknown>, [filter: unknown, update: unknown]>()
        .mockResolvedValue({}),
    };
    const service = new UsersService(
      userModel as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    return { service, userModel };
  };

  it('uses an atomic pipeline for the rolling failed-login lockout', async () => {
    const { service, userModel } = createService();

    await service.recordFailedLogin(
      '507f1f77bcf86cd799439011',
      new Date('2026-08-07T10:00:00.000Z'),
    );

    const update = userModel.updateOne.mock.calls[0][1];
    expect(Array.isArray(update)).toBe(true);
    expect(JSON.stringify(update)).toContain('loginLockedUntil');
    expect(JSON.stringify(update)).toContain('failedLoginAttempts');
  });

  it('increments the security version while clearing the refresh token', async () => {
    const { service, userModel } = createService();

    await service.invalidateSessions('507f1f77bcf86cd799439011');

    expect(userModel.updateOne).toHaveBeenCalledWith(
      { _id: '507f1f77bcf86cd799439011' },
      {
        $inc: { securityVersion: 1 },
        $unset: { refreshTokenHash: '' },
      },
    );
  });
});
