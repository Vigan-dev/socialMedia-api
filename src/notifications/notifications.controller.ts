import { Controller, Get, Patch, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

type RequestWithUser = Request & {
  user?: {
    id: string;
    email: string;
    role: string;
  };
};

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  findMine(
    @Req() request: RequestWithUser,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notificationsService.findForUser(request.user!.id, {
      cursor,
      limit,
    });
  }

  @Patch('read-all')
  markAllRead(@Req() request: RequestWithUser) {
    return this.notificationsService.markAllRead(request.user!.id);
  }
}
