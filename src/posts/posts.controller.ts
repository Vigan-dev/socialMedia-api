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
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreatePostDto } from './dto/create-post.dto';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostsService } from './posts.service';

type RequestWithUser = Request & {
  user?: {
    id: string;
    email: string;
    role: string;
  };
};

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(
    @Req() request: RequestWithUser,
    @Query('cursor') cursor?: string,
    @Query('feed') feed?: string,
    @Query('limit') limit?: string,
    @Query('sort') sort?: string,
  ) {
    return this.postsService.findAll(request.user?.id, {
      cursor,
      feed,
      limit,
      sort,
    });
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @RateLimit({ keyPrefix: 'posts:create', limit: 10, ttlMs: 60_000 })
  create(
    @Body() createPostDto: CreatePostDto,
    @Req() request: RequestWithUser,
  ) {
    return this.postsService.create(createPostDto, request.user!);
  }

  @Post(':id/like')
  @UseGuards(JwtAuthGuard)
  toggleLike(@Param('id') id: string, @Req() request: RequestWithUser) {
    return this.postsService.toggleLike(id, request.user!);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id') id: string,
    @Body() updatePostDto: UpdatePostDto,
    @Req() request: RequestWithUser,
  ) {
    return this.postsService.update(id, updatePostDto, request.user!);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string, @Req() request: RequestWithUser) {
    return this.postsService.remove(id, request.user!);
  }

  @Post(':id/hide')
  @UseGuards(JwtAuthGuard)
  hidePost(@Param('id') id: string, @Req() request: RequestWithUser) {
    return this.postsService.hidePost(id, request.user!);
  }

  @Post('reports')
  @UseGuards(JwtAuthGuard)
  report(
    @Body() createReportDto: CreateReportDto,
    @Req() request: RequestWithUser,
  ) {
    return this.postsService.report(createReportDto, request.user!);
  }

  @Post(':id/comments')
  @UseGuards(JwtAuthGuard)
  @RateLimit({ keyPrefix: 'posts:comment', limit: 20, ttlMs: 60_000 })
  addComment(
    @Param('id') id: string,
    @Body() createCommentDto: CreateCommentDto,
    @Req() request: RequestWithUser,
  ) {
    return this.postsService.addComment(id, createCommentDto, request.user!);
  }

  @Post(':postId/comments/:commentId/like')
  @UseGuards(JwtAuthGuard)
  toggleCommentLike(
    @Param('postId') postId: string,
    @Param('commentId') commentId: string,
    @Req() request: RequestWithUser,
  ) {
    return this.postsService.toggleCommentLike(
      postId,
      commentId,
      request.user!,
    );
  }

  @Post(':postId/comments/:commentId/replies')
  @UseGuards(JwtAuthGuard)
  @RateLimit({ keyPrefix: 'posts:reply', limit: 20, ttlMs: 60_000 })
  addReply(
    @Param('postId') postId: string,
    @Param('commentId') commentId: string,
    @Body() createCommentDto: CreateCommentDto,
    @Req() request: RequestWithUser,
  ) {
    return this.postsService.addReply(
      postId,
      commentId,
      createCommentDto,
      request.user!,
    );
  }

  @Post(':postId/comments/:commentId/replies/:replyId/like')
  @UseGuards(JwtAuthGuard)
  toggleReplyLike(
    @Param('postId') postId: string,
    @Param('commentId') commentId: string,
    @Param('replyId') replyId: string,
    @Req() request: RequestWithUser,
  ) {
    return this.postsService.toggleReplyLike(
      postId,
      commentId,
      replyId,
      request.user!,
    );
  }
}
