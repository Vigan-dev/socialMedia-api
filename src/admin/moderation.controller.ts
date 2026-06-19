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

@Controller('moderation')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...roleGroups.moderation)
export class ModerationController {
  constructor(private readonly adminService: AdminService) {}

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
