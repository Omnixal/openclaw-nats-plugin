import {
  Controller, Get, Post, Delete,
  Body, Param, BaseController,
  UseMiddleware, Subscribe,
  type Message,
  type OneBunResponse,
} from '@onebun/core';
import { type } from 'arktype';
import { SchedulerService } from './scheduler.service';
import { ApiKeyMiddleware } from '../auth/api-key.middleware';

const createCronBody = type({
  name: 'string',
  cron: 'string',
  subject: 'string',
  'payload?': 'unknown',
  'timezone?': 'string',
});

type CreateCronBody = typeof createCronBody.infer;

@Controller('/api/cron')
@UseMiddleware(ApiKeyMiddleware)
export class SchedulerController extends BaseController {
  constructor(private scheduler: SchedulerService) {
    super();
  }

  @Post()
  async createJob(@Body(createCronBody) body: CreateCronBody): Promise<OneBunResponse> {
    if (!body.subject.startsWith('agent.events.')) {
      return this.error('subject must start with agent.events.', 400, 400);
    }
    const job = await this.scheduler.add({
      name: body.name,
      expr: body.cron,
      subject: body.subject,
      payload: body.payload,
      timezone: body.timezone,
    });
    return this.success(job);
  }

  @Get()
  async listJobs(): Promise<OneBunResponse> {
    const jobs = await this.scheduler.list();
    return this.success(jobs);
  }

  @Delete('/:name')
  async deleteJob(@Param('name') name: string): Promise<OneBunResponse> {
    const deleted = await this.scheduler.remove(name);
    if (!deleted) return this.error('Job not found', 404, 404);
    return this.success({ deleted: true });
  }

  @Subscribe('scheduler.fire.*')
  async handleFire(message: Message<unknown>): Promise<void> {
    const jobName = message.pattern?.split('.').pop();
    if (jobName) {
      await this.scheduler.handleFire(jobName);
    }
  }
}
