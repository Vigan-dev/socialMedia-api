import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AiService } from './ai.service';
import { SupportChatDto } from './dto/support-chat.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RateLimit } from '../rate-limit/rate-limit.decorator';

type RequestWithUser = Request & {
  user?: {
    email: string;
    id: string;
    role: string;
  };
};

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('support-chat')
  @RateLimit({ keyPrefix: 'ai:support-chat', limit: 15, ttlMs: 60_000 })
  createSupportReply(
    @Body() supportChatDto: SupportChatDto,
    @Req() request: RequestWithUser,
  ) {
    return this.aiService.createSupportReply(
      request.user!.id,
      supportChatDto.message ?? '',
      supportChatDto.sessionId,
    );
  }

  @Get('support-chat/:sessionId')
  getSessionMessages(
    @Param('sessionId') sessionId: string,
    @Req() request: RequestWithUser,
  ) {
    return this.aiService.getSessionMessages(request.user!.id, sessionId);
  }

  @Get('support-chat')
  getSessions(@Req() request: RequestWithUser) {
    return this.aiService.getSessions(request.user!.id);
  }
}
