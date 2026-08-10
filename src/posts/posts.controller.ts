import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreatePostDto } from './dto/create-post.dto';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { RecommendationFeedbackDto } from './dto/recommendation-feedback.dto';
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

  @Get('discovery')
  @UseGuards(JwtAuthGuard)
  discover(
    @Req() request: RequestWithUser,
    @Query('limit') limit?: string,
    @Query('tag') tag?: string,
  ) {
    return this.postsService.discover(request.user!.id, { limit, tag });
  }

  @Get('search')
  @UseGuards(JwtAuthGuard)
  search(
    @Req() request: RequestWithUser,
    @Query('q') query?: string,
    @Query('limit') limit?: string,
  ) {
    return this.postsService.search(request.user!.id, { limit, query });
  }

  @Get('topics/trending')
  @UseGuards(JwtAuthGuard)
  trendingTopics(
    @Req() request: RequestWithUser,
    @Query('limit') limit?: string,
  ) {
    return this.postsService.findTrendingTopics(request.user!.id, limit);
  }

  @Get('recommendation/preferences')
  @UseGuards(JwtAuthGuard)
  getRecommendationPreferences(@Req() request: RequestWithUser) {
    return this.postsService.getRecommendationPreferences(request.user!.id);
  }

  @Put('recommendation/topics/:topic/mute')
  @UseGuards(JwtAuthGuard)
  muteRecommendationTopic(
    @Param('topic') topic: string,
    @Req() request: RequestWithUser,
  ) {
    return this.postsService.muteRecommendationTopic(request.user!.id, topic);
  }

  @Delete('recommendation/topics/:topic/mute')
  @UseGuards(JwtAuthGuard)
  unmuteRecommendationTopic(
    @Param('topic') topic: string,
    @Req() request: RequestWithUser,
  ) {
    return this.postsService.unmuteRecommendationTopic(request.user!.id, topic);
  }

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

  @Get('by-user/:username')
  @UseGuards(OptionalJwtAuthGuard)
  findByAuthorUsername(
    @Param('username') username: string,
    @Req() request: RequestWithUser,
  ) {
    return this.postsService.findByAuthorUsername(username, request.user?.id);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  findOne(@Param('id') id: string, @Req() request: RequestWithUser) {
    return this.postsService.findById(id, request.user?.id);
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

  @Put(':id/like')
  @UseGuards(JwtAuthGuard)
  like(@Param('id') id: string, @Req() request: RequestWithUser) {
    return this.postsService.setLike(id, request.user!, true);
  }

  @Delete(':id/like')
  @UseGuards(JwtAuthGuard)
  unlike(@Param('id') id: string, @Req() request: RequestWithUser) {
    return this.postsService.setLike(id, request.user!, false);
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

  @Post(':id/recommendation-feedback')
  @UseGuards(JwtAuthGuard)
  @RateLimit({
    keyPrefix: 'posts:recommendation-feedback',
    limit: 30,
    ttlMs: 60_000,
  })
  recordRecommendationFeedback(
    @Param('id') id: string,
    @Body() body: RecommendationFeedbackDto,
    @Req() request: RequestWithUser,
  ) {
    return this.postsService.recordRecommendationFeedback(
      request.user!.id,
      id,
      body.action,
    );
  }

  @Delete(':id/recommendation-feedback')
  @UseGuards(JwtAuthGuard)
  removeRecommendationFeedback(
    @Param('id') id: string,
    @Req() request: RequestWithUser,
  ) {
    return this.postsService.removeRecommendationFeedback(request.user!.id, id);
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

  @Put(':postId/comments/:commentId/like')
  @UseGuards(JwtAuthGuard)
  likeComment(
    @Param('postId') postId: string,
    @Param('commentId') commentId: string,
    @Req() request: RequestWithUser,
  ) {
    return this.postsService.setCommentLike(
      postId,
      commentId,
      request.user!,
      true,
    );
  }

  @Delete(':postId/comments/:commentId/like')
  @UseGuards(JwtAuthGuard)
  unlikeComment(
    @Param('postId') postId: string,
    @Param('commentId') commentId: string,
    @Req() request: RequestWithUser,
  ) {
    return this.postsService.setCommentLike(
      postId,
      commentId,
      request.user!,
      false,
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

  @Put(':postId/comments/:commentId/replies/:replyId/like')
  @UseGuards(JwtAuthGuard)
  likeReply(
    @Param('postId') postId: string,
    @Param('commentId') commentId: string,
    @Param('replyId') replyId: string,
    @Req() request: RequestWithUser,
  ) {
    return this.postsService.setReplyLike(
      postId,
      commentId,
      replyId,
      request.user!,
      true,
    );
  }

  @Delete(':postId/comments/:commentId/replies/:replyId/like')
  @UseGuards(JwtAuthGuard)
  unlikeReply(
    @Param('postId') postId: string,
    @Param('commentId') commentId: string,
    @Param('replyId') replyId: string,
    @Req() request: RequestWithUser,
  ) {
    return this.postsService.setReplyLike(
      postId,
      commentId,
      replyId,
      request.user!,
      false,
    );
  }
}
