import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ConversationsService } from './conversations.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateTypingDto } from './dto/update-typing.dto';

type RequestWithUser = Request & {
  user?: {
    id: string;
    email: string;
    role: string;
  };
};

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  findMine(@Req() request: RequestWithUser) {
    return this.conversationsService.findForUser(request.user!.id);
  }

  @Post()
  findOrCreate(
    @Req() request: RequestWithUser,
    @Body() body: CreateConversationDto,
  ) {
    return this.conversationsService.findOrCreate(
      request.user!.id,
      body.participantId,
    );
  }

  @Get(':id/messages')
  findMessages(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.conversationsService.findMessages(request.user!.id, id);
  }

  @Post(':id/messages')
  sendMessage(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() body: SendMessageDto,
  ) {
    return this.conversationsService.sendMessage(
      request.user!.id,
      id,
      body.body,
    );
  }

  @Patch(':id/read')
  markRead(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.conversationsService.markRead(request.user!.id, id);
  }

  @Patch(':id/typing')
  updateTyping(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() body: UpdateTypingDto,
  ) {
    return this.conversationsService.updateTyping(
      request.user!.id,
      id,
      body.isTyping,
    );
  }
}
