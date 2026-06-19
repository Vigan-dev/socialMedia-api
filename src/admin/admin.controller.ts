import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { roleGroups } from '../auth/roles';

type RequestWithUser = Request & {
  user?: {
    email: string;
    id: string;
    role: string;
  };
};

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...roleGroups.adminOnly)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('profile')
  getProfile() {
    return this.adminService.getProfile();
  }

  @Get('metrics')
  getMetrics() {
    return this.adminService.getMetrics();
  }

  @Get('users')
  getUsers(@Query('q') query?: string) {
    return this.adminService.getUsers(query);
  }

  @Patch('users/:id/suspension')
  updateUserSuspension(
    @Param('id') id: string,
    @Body() body: { isSuspended?: boolean; reason?: string },
    @Req() request: RequestWithUser,
  ) {
    return this.adminService.updateUserSuspension(id, body, request.user!);
  }

  @Get('reports')
  getReports(@Query('status') status?: string) {
    return this.adminService.getReports(status);
  }

  @Get('audit-logs')
  getAuditLogs() {
    return this.adminService.getAuditLogs();
  }

  @Patch('reports/:id')
  updateReport(
    @Param('id') id: string,
    @Body() body: { status?: string },
    @Req() request: RequestWithUser,
  ) {
    return this.adminService.updateReport(id, body.status, request.user!);
  }

  @Delete('posts/:id')
  deletePost(@Param('id') id: string, @Req() request: RequestWithUser) {
    return this.adminService.deletePost(id, request.user!);
  }

  @Delete('comments/:id')
  deleteComment(@Param('id') id: string, @Req() request: RequestWithUser) {
    return this.adminService.deleteComment(id, request.user!);
  }
}
