import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  BaseController,
  UseMiddleware,
  type OneBunResponse,
} from '@onebun/core';
import { type } from 'arktype';
import { RouterService } from './router.service';
import { ApiKeyMiddleware } from '../auth/api-key.middleware';

const createRouteBody = type({
  pattern: 'string',
  'target?': 'string',
  'priority?': 'number',
});

type CreateRouteBody = typeof createRouteBody.infer;

@Controller('/api/routes')
@UseMiddleware(ApiKeyMiddleware)
export class RouterController extends BaseController {
  constructor(private routerService: RouterService) {
    super();
  }

  @Get('/status')
  async getStatus(): Promise<OneBunResponse> {
    const status = await this.routerService.status();
    return this.success(status);
  }

  @Get()
  async getRoutes(@Query() query: Record<string, string>): Promise<OneBunResponse> {
    const filters: { pattern?: string; target?: string } = {};
    if (query?.pattern) filters.pattern = query.pattern;
    if (query?.target) filters.target = query.target;
    const routes = await this.routerService.listRoutes(filters);
    return this.success(routes);
  }

  @Post()
  async createRoute(@Body(createRouteBody) body: CreateRouteBody): Promise<OneBunResponse> {
    if (!body.pattern.startsWith('agent.events.')) {
      return this.error('pattern must start with agent.events.', 400, 400);
    }
    const { route, created } = await this.routerService.subscribe(
      body.pattern,
      body.target ?? 'main',
      body.priority ?? 5,
    );
    return this.success({ ...route, created });
  }

  @Delete('/:id')
  async deleteRoute(@Param('id') id: string): Promise<OneBunResponse> {
    const deleted = await this.routerService.deleteById(id);
    if (!deleted) {
      return this.error('Route not found', 404, 404);
    }
    return this.success({ deleted: true });
  }
}
