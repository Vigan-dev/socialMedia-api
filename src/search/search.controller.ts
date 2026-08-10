import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { UnifiedSearchQueryDto } from './dto/unified-search-query.dto';
import { SearchService } from './search.service';

type RequestWithUser = Request & {
  user?: { id: string };
};

@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @RateLimit({ keyPrefix: 'search:unified', limit: 60, ttlMs: 60_000 })
  search(
    @Req() request: RequestWithUser,
    @Query() query: UnifiedSearchQueryDto,
  ) {
    return this.searchService.search(request.user!.id, query);
  }
}
