import { Controller, Get, Post, Body, Param, BaseController, UseMiddleware, type OneBunResponse } from '@onebun/core';
import { PendingService } from './pending.service';
import { ApiKeyMiddleware } from '../auth/api-key.middleware';
import { markDeliveredBodySchema, type MarkDeliveredBody } from '../validation/schemas';

@Controller('/api/pending')
@UseMiddleware(ApiKeyMiddleware)
export class PendingController extends BaseController {
  constructor(private pendingService: PendingService) {
    super();
  }

  @Get('/:sessionKey')
  async fetchPending(@Param('sessionKey') sessionKey: string): Promise<OneBunResponse> {
    const events = await this.pendingService.fetchPending(sessionKey);
    return this.success(events.map(e => ({
      ...e,
      createdAt: e.createdAt.getTime(),
      deliveredAt: e.deliveredAt?.getTime() ?? null,
    })));
  }

  @Post('/mark-delivered')
  async markDelivered(@Body(markDeliveredBodySchema) body: MarkDeliveredBody): Promise<OneBunResponse> {
    await this.pendingService.markDelivered(body.ids);
    return this.success({ marked: body.ids.length });
  }
}
