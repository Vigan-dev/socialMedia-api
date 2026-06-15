import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import { UpdateAvatarDto } from './dto/update-avatar.dto';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';
import { UpdatePrivacyDto } from './dto/update-privacy.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateStatusDto } from './dto/update-status.dto';

type RequestWithUser = Request & {
  user?: {
    id: string;
    email: string;
    role: string;
  };
};

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(@Req() request: RequestWithUser) {
    return this.usersService.findAll(request.user?.id);
  }

  @Get('me')
  getMe(@Req() request: RequestWithUser) {
    return this.usersService.getProfile(request.user!.id);
  }

  @Get('me/followers')
  getMyFollowers(@Req() request: RequestWithUser) {
    return this.usersService.findFollowers(request.user!.id);
  }

  @Get('me/following')
  getMyFollowing(@Req() request: RequestWithUser) {
    return this.usersService.findFollowing(request.user!.id);
  }

  @Get('suggestions')
  getSuggestions(@Req() request: RequestWithUser) {
    return this.usersService.findSuggestedUsers(request.user!.id);
  }

  @Get('username-availability')
  checkUsernameAvailability(
    @Req() request: RequestWithUser,
    @Query('username') username: string,
  ) {
    return this.usersService.checkUsernameAvailability(
      request.user!.id,
      username,
    );
  }

  @Patch('me')
  updateMe(@Req() request: RequestWithUser, @Body() body: UpdateProfileDto) {
    return this.usersService.updateProfile(request.user!.id, body);
  }

  @Patch('avatar')
  updateAvatar(@Req() request: RequestWithUser, @Body() body: UpdateAvatarDto) {
    return this.usersService.updateAvatar(request.user!.id, body.avatarUrl);
  }

  @Patch('status')
  updateStatus(@Req() request: RequestWithUser, @Body() body: UpdateStatusDto) {
    return this.usersService.updateStatus(request.user!.id, body.status);
  }

  @Patch('privacy')
  updatePrivacy(
    @Req() request: RequestWithUser,
    @Body() body: UpdatePrivacyDto,
  ) {
    return this.usersService.updatePrivacy(request.user!.id, body);
  }

  @Patch('notification-settings')
  updateNotificationSettings(
    @Req() request: RequestWithUser,
    @Body() body: UpdateNotificationSettingsDto,
  ) {
    return this.usersService.updateNotificationSettings(request.user!.id, body);
  }

  @Post(':id/follow')
  toggleFollow(@Param('id') id: string, @Req() request: RequestWithUser) {
    return this.usersService.toggleFollow(request.user!.id, id);
  }

  @Post(':id/block')
  blockUser(@Param('id') id: string, @Req() request: RequestWithUser) {
    return this.usersService.blockUser(request.user!.id, id);
  }

  @Delete(':id/block')
  unblockUser(@Param('id') id: string, @Req() request: RequestWithUser) {
    return this.usersService.unblockUser(request.user!.id, id);
  }

  @Post(':id/mute')
  muteUser(@Param('id') id: string, @Req() request: RequestWithUser) {
    return this.usersService.muteUser(request.user!.id, id);
  }

  @Delete(':id/mute')
  unmuteUser(@Param('id') id: string, @Req() request: RequestWithUser) {
    return this.usersService.unmuteUser(request.user!.id, id);
  }
}
