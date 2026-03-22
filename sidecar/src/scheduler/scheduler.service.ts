import { Service, BaseService, QueueService } from '@onebun/core';
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
export class SchedulerService extends BaseService {
  constructor(
    private repo: SchedulerRepository,
    private queueService: QueueService,
    private publisher: PublisherService,
  ) {
    super();
  }

  private get scheduler() {
    return this.queueService.getScheduler();
  }

  async restoreJobs(): Promise<void> {
    const jobs = await this.repo.findAllEnabled();
    for (const job of jobs) {
      this.scheduler.addCronJob(
        job.name,
        job.expr,
        `scheduler.fire.${job.name}`,
      );
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

    if (this.scheduler.hasJob(input.name)) {
      // Remove and re-add to update the cron expression
      this.scheduler.removeJob(input.name);
    }
    this.scheduler.addCronJob(
      input.name,
      input.expr,
      `scheduler.fire.${input.name}`,
    );

    this.logger.info(`Cron job '${input.name}' registered: ${input.expr} -> ${input.subject}`);
    return job;
  }

  async remove(name: string): Promise<boolean> {
    const deleted = await this.repo.deleteByName(name);
    if (this.scheduler.hasJob(name)) {
      this.scheduler.removeJob(name);
    }
    return deleted;
  }

  async list() {
    const dbJobs = await this.repo.findAll();
    return dbJobs.map(job => {
      const runtime = this.scheduler.getJob(job.name);
      return {
        ...job,
        nextRun: runtime?.nextRun ?? null,
        isRunning: runtime?.isRunning ?? false,
      };
    });
  }

  async toggle(name: string) {
    const job = await this.repo.findByName(name);
    if (!job) return null;

    const newEnabled = !job.enabled;
    await this.repo.setEnabled(name, newEnabled);

    if (newEnabled) {
      this.scheduler.addCronJob(
        name,
        job.expr,
        `scheduler.fire.${name}`,
      );
      this.logger.info(`Cron job '${name}' enabled`);
    } else {
      if (this.scheduler.hasJob(name)) {
        this.scheduler.removeJob(name);
      }
      this.logger.info(`Cron job '${name}' disabled`);
    }

    return this.repo.findByName(name);
  }

  async fireNow(name: string): Promise<boolean> {
    const job = await this.repo.findByName(name);
    if (!job) return false;

    const base = (job.payload && typeof job.payload === 'object' && !Array.isArray(job.payload))
      ? (job.payload as Record<string, unknown>)
      : {};
    const payload = { ...base, _cron: { jobName: job.name, firedAt: new Date().toISOString(), manual: true } };
    await this.publisher.publish(job.subject, payload);
    await this.repo.updateLastRun(name);
    this.logger.info(`Cron job '${name}' manually fired -> ${job.subject}`);
    return true;
  }

  async handleFire(jobName: string): Promise<void> {
    const job = await this.repo.findByName(jobName);
    if (!job || !job.enabled) return;

    const base = (job.payload && typeof job.payload === 'object' && !Array.isArray(job.payload))
      ? (job.payload as Record<string, unknown>)
      : {};
    const payload = { ...base, _cron: { jobName: job.name, firedAt: new Date().toISOString() } };
    await this.publisher.publish(job.subject, payload);
    await this.repo.updateLastRun(job.name);
    this.logger.debug(`Cron fired: ${job.name} -> ${job.subject}`);
  }
}
