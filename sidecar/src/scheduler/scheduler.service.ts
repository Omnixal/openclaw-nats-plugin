import { Service, BaseService, QueueService, OnModuleInit } from '@onebun/core';
import { SchedulerRepository } from './scheduler.repository';
import { PublisherService } from '../publisher/publisher.service';
import { ulid } from 'ulid';

interface AddJobInput {
  name: string;
  expr: string;
  subject: string;
  payload?: unknown;
  timezone?: string;
}

@Service()
export class SchedulerService extends BaseService implements OnModuleInit {
  constructor(
    private repo: SchedulerRepository,
    private queueService: QueueService,
    private publisher: PublisherService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    const jobs = await this.repo.findAllEnabled();
    for (const job of jobs) {
      this.queueService.addJob({
        type: 'cron',
        name: job.name,
        expression: job.expr,
        pattern: `scheduler.fire.${job.name}`,
      });
    }
    if (jobs.length > 0) {
      this.logger.info(`Restored ${jobs.length} cron jobs from DB`);
    }
  }

  async add(input: AddJobInput) {
    const job = await this.repo.upsert({
      id: ulid(),
      name: input.name,
      expr: input.expr,
      subject: input.subject,
      payload: input.payload ?? null,
      timezone: input.timezone ?? 'UTC',
      enabled: true,
      createdAt: new Date(),
    });

    if (this.queueService.hasJob(input.name)) {
      this.queueService.updateJob({
        type: 'cron',
        name: input.name,
        expression: input.expr,
      });
    } else {
      this.queueService.addJob({
        type: 'cron',
        name: input.name,
        expression: input.expr,
        pattern: `scheduler.fire.${input.name}`,
      });
    }

    this.logger.info(`Cron job '${input.name}' registered: ${input.expr} -> ${input.subject}`);
    return job;
  }

  async remove(name: string): Promise<boolean> {
    const deleted = await this.repo.deleteByName(name);
    if (this.queueService.hasJob(name)) {
      this.queueService.removeJob(name);
    }
    return deleted;
  }

  async list() {
    const dbJobs = await this.repo.findAll();
    return dbJobs.map(job => {
      const runtime = this.queueService.getJob(job.name);
      return {
        ...job,
        nextRun: runtime?.nextRun ?? null,
        isRunning: runtime?.isRunning ?? false,
      };
    });
  }

  async handleFire(jobName: string): Promise<void> {
    const job = await this.repo.findByName(jobName);
    if (!job || !job.enabled) return;

    await this.publisher.publish(job.subject, job.payload ?? {});
    await this.repo.updateLastRun(job.name);
    this.logger.debug(`Cron fired: ${job.name} -> ${job.subject}`);
  }
}
