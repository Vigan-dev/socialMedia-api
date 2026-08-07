import { RealtimeGateway } from './realtime.gateway';

describe('RealtimeGateway', () => {
  const validPayload = {
    email: 'user@example.com',
    role: 'user',
    sub: 'user-1',
    tokenType: 'access',
  };
  let configService: { getOrThrow: jest.Mock };
  let jwtService: { verifyAsync: jest.Mock };
  let gateway: RealtimeGateway;

  beforeEach(() => {
    configService = {
      getOrThrow: jest.fn((key: string) =>
        key === 'CLIENT_ORIGINS'
          ? 'http://localhost:3001,https://app.example.com'
          : 'a-secure-test-secret-that-is-long-enough',
      ),
    };
    jwtService = { verifyAsync: jest.fn().mockResolvedValue(validPayload) };
    gateway = new RealtimeGateway(
      configService as never,
      jwtService as never,
      {} as never,
    );
  });

  function socket(
    origin = 'http://localhost:3001',
    cookie = 'access_token=jwt',
  ) {
    return {
      data: {},
      disconnect: jest.fn(),
      handshake: { headers: { cookie, origin } },
      join: jest.fn().mockResolvedValue(undefined),
    };
  }

  it('authenticates the access cookie and joins only the current user room', async () => {
    const client = socket();

    await gateway.handleConnection(client as never);

    expect(jwtService.verifyAsync).toHaveBeenCalledWith(
      'jwt',
      expect.objectContaining({
        audience: 'socialmedia-access',
        issuer: 'socialmedia-api',
      }),
    );
    expect(client.join).toHaveBeenCalledWith('user:user-1');
    expect(client.data).toEqual({ userId: 'user-1' });
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('rejects cross-origin socket handshakes before token verification', async () => {
    const client = socket('https://attacker.example.com');

    await gateway.handleConnection(client as never);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
    expect(client.join).not.toHaveBeenCalled();
  });

  it('rejects invalid access tokens', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('invalid token'));
    const client = socket();

    await gateway.handleConnection(client as never);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });
});
