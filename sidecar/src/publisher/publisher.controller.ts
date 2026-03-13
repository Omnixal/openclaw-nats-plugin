import { Controller, Post, Body, BaseController, UseMiddleware, type OneBunResponse } from '@onebun/core';
import { PublisherService } from './publisher.service';
import { ApiKeyMiddleware } from '../auth/api-key.middleware';
import { publishBodySchema, type PublishBody } from '../validation/schemas';

@Controller('/api/publish')
@UseMiddleware(ApiKeyMiddleware)
export class PublisherController extends BaseController {
  constructor(private publisherService: PublisherService) {
    super();
  }

  @Post()
  async publish(@Body(publishBodySchema) body: PublishBody): Promise<OneBunResponse> {
    if (!body.subject.startsWith('agent.events.')) {
      return this.error('subject must start with agent.events.', 400, 400);
    }
    await this.publisherService.publish(body.subject, body.payload, body.meta);
    return this.success({ published: true });
  }
}
