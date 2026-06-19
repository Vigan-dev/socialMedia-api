import { Controller, Get, Param } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('public/users')
export class PublicUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':username')
  getPublicProfile(@Param('username') username: string) {
    return this.usersService.getPublicProfileByUsername(username);
  }
}
