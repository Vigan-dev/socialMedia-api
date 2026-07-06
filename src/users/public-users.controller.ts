import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { UsersService } from './users.service';

type RequestWithUser = Request & {
  user?: {
    id: string;
    email: string;
    role: string;
  } | null;
};

@Controller('public/users')
export class PublicUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':username')
  @UseGuards(OptionalJwtAuthGuard)
  getPublicProfile(
    @Param('username') username: string,
    @Req() request: RequestWithUser,
  ) {
    return this.usersService.getPublicProfileByUsername(
      username,
      request.user?.id,
    );
  }
}
