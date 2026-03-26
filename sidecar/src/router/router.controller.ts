import {
  Controller,
  Get,
  Post,
  Patch,
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
import {
  createRouteBodySchema, type CreateRouteBody,
  updateRouteBodySchema, type UpdateRouteBody,
  isValidAgentSubject,
} from '../validation/schemas';

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
    const result = routes.map(r => ({
      id: r.id,
      pattern: r.pattern,
      target: r.target,
      priority: r.priority,
      enabled: r.enabled,
      customPayload: r.customPayload ?? null,
      lastDeliveredAt: r.lastDeliveredAt?.toISOString() ?? null,
      lastEventSubject: r.lastEventSubject ?? null,
      deliveryCount: r.deliveryCount ?? 0,
      lagMs: r.lastDeliveryLagMs ?? null,
    }));
    return this.success(result);
  }

  @Get()
  async getRoutes(
    @Query('pattern') pattern?: string,
    @Query('target') target?: string,
  ): Promise<OneBunResponse> {
    const filters: { pattern?: string; target?: string } = {};
    if (pattern) filters.pattern = pattern;
    if (target) filters.target = target;
    const routes = await this.routerService.listRoutes(filters);
    return this.success(routes);
  }

  @Post()
  async createRoute(@Body(createRouteBodySchema) body: CreateRouteBody): Promise<OneBunResponse> {
    if (!isValidAgentSubject(body.pattern)) {
      return this.error('pattern must start with "agent.events." followed by at least one token and must not end with "."', 400, 400);
    }
    const { route, created } = await this.routerService.subscribe(
      body.pattern,
      body.target ?? 'main',
      body.priority ?? 5,
      body.payload,
    );
    return this.success({ ...route, created });
  }

  @Patch('/:id')
  async updateRoute(
    @Param('id') id: string,
    @Body(updateRouteBodySchema) body: UpdateRouteBody,
  ): Promise<OneBunResponse> {
    const { payload: customPayload, ...rest } = body;
    const updated = await this.routerService.updateById(id, { ...rest, ...(customPayload !== undefined ? { customPayload } : {}) });
    if (!updated) {
      return this.error('Route not found', 404, 404);
    }
    return this.success(updated);
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
