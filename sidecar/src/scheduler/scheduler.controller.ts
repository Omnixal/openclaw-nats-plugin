import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, BaseController,
  UseMiddleware, Subscribe, OnQueueReady,
  type Message,
  type OneBunResponse,
} from '@onebun/core';
import { SchedulerService } from './scheduler.service';
import { ApiKeyMiddleware } from '../auth/api-key.middleware';
import { createCronBodySchema, type CreateCronBody } from '../validation/schemas';

@Controller('/api/cron')
@UseMiddleware(ApiKeyMiddleware)
export class SchedulerController extends BaseController {
  constructor(private scheduler: SchedulerService) {
    super();
  }

  @OnQueueReady()
  async onQueueReady(): Promise<void> {
    await this.scheduler.restoreJobs();
  }

  @Post()
  async createJob(@Body(createCronBodySchema) body: CreateCronBody): Promise<OneBunResponse> {
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

  @Patch('/:name/toggle')
  async toggleJob(@Param('name') name: string): Promise<OneBunResponse> {
    const result = await this.scheduler.toggle(name);
    if (!result) return this.error('Job not found', 404, 404);
    return this.success(result);
  }

  @Post('/:name/run')
  async runJob(@Param('name') name: string): Promise<OneBunResponse> {
    const fired = await this.scheduler.fireNow(name);
    if (!fired) return this.error('Job not found', 404, 404);
    return this.success({ fired: true });
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
