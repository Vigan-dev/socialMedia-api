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
import { AdminIdParamDto } from './dto/admin-id-param.dto';
import {
  AdminReportsQueryDto,
  AdminUsersQueryDto,
} from './dto/admin-query.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { UpdateUserSuspensionDto } from './dto/update-user-suspension.dto';

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
  getUsers(@Query() query: AdminUsersQueryDto) {
    return this.adminService.getUsers(query.q);
  }

  @Patch('users/:id/suspension')
  updateUserSuspension(
    @Param() params: AdminIdParamDto,
    @Body() body: UpdateUserSuspensionDto,
    @Req() request: RequestWithUser,
  ) {
    return this.adminService.updateUserSuspension(
      params.id,
      body,
      request.user!,
    );
  }

  @Get('reports')
  getReports(@Query() query: AdminReportsQueryDto) {
    return this.adminService.getReports(query.status);
  }

  @Get('audit-logs')
  getAuditLogs() {
    return this.adminService.getAuditLogs();
  }

  @Patch('reports/:id')
  updateReport(
    @Param() params: AdminIdParamDto,
    @Body() body: UpdateReportDto,
    @Req() request: RequestWithUser,
  ) {
    return this.adminService.updateReport(
      params.id,
      body.status,
      request.user!,
    );
  }

  @Delete('posts/:id')
  deletePost(
    @Param() params: AdminIdParamDto,
    @Req() request: RequestWithUser,
  ) {
    return this.adminService.deletePost(params.id, request.user!);
  }

  @Delete('comments/:id')
  deleteComment(
    @Param() params: AdminIdParamDto,
    @Req() request: RequestWithUser,
  ) {
    return this.adminService.deleteComment(params.id, request.user!);
  }
}
