import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import {
  accessTokenAudience,
  isAccessTokenPayload,
  jwtIssuer,
} from '../auth/auth-token';
import type {
  RealtimeClientEvents,
  RealtimeInterServerEvents,
  RealtimeServerEvents,
  RealtimeSocketData,
} from './realtime-events';
import { RealtimePublisher } from './realtime.publisher';

type RealtimeServer = Server<
  RealtimeClientEvents,
  RealtimeServerEvents,
  RealtimeInterServerEvents,
  RealtimeSocketData
>;

type RealtimeSocket = Socket<
  RealtimeClientEvents,
  RealtimeServerEvents,
  RealtimeInterServerEvents,
  RealtimeSocketData
>;

function readCookie(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) return null;

  for (const segment of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = segment.trim().split('=');
    if (rawName !== name) continue;

    try {
      return decodeURIComponent(rawValue.join('='));
    } catch {
      return null;
    }
  }

  return null;
}

@Injectable()
@WebSocketGateway({
  cors: { credentials: true, origin: true },
  transports: ['polling', 'websocket'],
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer()
  server!: RealtimeServer;

  private readonly allowedOrigins: Set<string>;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly publisher: RealtimePublisher,
  ) {
    this.allowedOrigins = new Set(
      this.configService
        .getOrThrow<string>('CLIENT_ORIGINS')
        .split(',')
        .map((origin) => origin.trim()),
    );
  }

  afterInit(server: RealtimeServer) {
    this.publisher.bindServer(server);
  }

  async handleConnection(client: RealtimeSocket) {
    const origin = client.handshake.headers.origin;

    if (!origin || !this.allowedOrigins.has(origin)) {
      client.disconnect(true);
      return;
    }

    const accessToken = readCookie(
      client.handshake.headers.cookie,
      'access_token',
    );

    if (!accessToken) {
      client.disconnect(true);
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync<
        Record<string, unknown>
      >(accessToken, {
        audience: accessTokenAudience,
        issuer: jwtIssuer,
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      });

      if (!isAccessTokenPayload(payload)) {
        client.disconnect(true);
        return;
      }

      client.data.userId = payload.sub;
      await client.join(`user:${payload.sub}`);
    } catch {
      client.disconnect(true);
    }
  }
}
