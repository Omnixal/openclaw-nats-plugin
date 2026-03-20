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
import { RouterService } from './router.service';
import { ApiKeyMiddleware } from '../auth/api-key.middleware';
import { createRouteBodySchema, type CreateRouteBody } from '../validation/schemas';

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

  @Get('/health')
  async getRoutesHealth(): Promise<OneBunResponse> {
    const routes = await this.routerService.listRoutes();
    const now = Date.now();
    const result = routes.map(r => ({
      pattern: r.pattern,
      target: r.target,
      enabled: r.enabled,
      lastDeliveredAt: r.lastDeliveredAt?.toISOString() ?? null,
      lastEventSubject: r.lastEventSubject ?? null,
      deliveryCount: r.deliveryCount ?? 0,
      lagMs: r.lastDeliveredAt ? now - r.lastDeliveredAt.getTime() : null,
    }));
    return this.success(result);
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
  async createRoute(@Body(createRouteBodySchema) body: CreateRouteBody): Promise<OneBunResponse> {
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
